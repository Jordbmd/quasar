import { readWebOSD } from "./web-osd";
import { Cam } from "onvif";
import http from "node:http";
import net from "node:net";
import { AsyncLocalStorage } from "node:async_hooks";
import { createCipheriv } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import { vendorHttpMac } from "./vendor-transport";
import { parseVendorDocument, extractVendorGroup } from "./vendor-profile";
import { vendorGroups, vendorExtraWrites } from "../shared/vendor-profile";
import { abortable, cancelled } from "./cancellation";
import { parseOSDs, parseOSDOptions } from "./osd";
import { videoCapabilities } from "../shared/video-options";
import type { Camera, Feature, CameraDetail } from "../shared/types";
import { NetworkGuard } from "./network";
import { Diagnostics, bounded } from "./diagnostics";
export const array = (v: any): any[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];
export const token = (v: any): string => String(v?.$?.token ?? v?.token ?? "");
export function xmlEscape(v: unknown): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
export function escapeTree(v: any): any {
  if (typeof v === "string") return xmlEscape(v);
  if (Array.isArray(v)) return v.map(escapeTree);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, escapeTree(x)]),
    );
  return v;
}
export function matchInterface(nics: any[], ip: string) {
  const matches = nics.filter(
    (n) =>
      array(n.IPv4?.config?.manual).some((x) => String(x.address) === ip) ||
      String(n.IPv4?.config?.fromDHCP?.address) === ip,
  );
  if (matches.length !== 1)
    throw new Error(
      "Interface caméra ambiguë : impossible de cibler une interface unique.",
    );
  return matches[0];
}
export class CameraConnection {
  cam: any;
  agent: http.Agent;
  closed = false;
  writeAttempts = 0;
  pending = new Set<(reason: unknown) => void>();
  private webProcesses = new Set<ChildProcess>();
  private readonly epoch: number;
  private readonly source: string;
  private lane: Promise<unknown> = Promise.resolve();
  // Firmware often has a single configuration worker. Start timeouts only when
  // an operation owns the lane; queued work must not expire another request.
  serialized<T>(work: () => Promise<T>): Promise<T> {
    const signal = this.readSignal.getStore();
    const result = this.lane.then(() => {
      signal?.throwIfAborted();
      if (this.closed) throw new Error("Connexion fermée.");
      return work();
    });
    this.lane = result.catch(() => {});
    return abortable(result, signal);
  }
  private readSignal = new AsyncLocalStorage<AbortSignal>();
  withReadSignal<T>(signal: AbortSignal, work: () => Promise<T>) {
    signal.throwIfAborted();
    return this.readSignal.run(signal, () => abortable(work(), signal));
  }
  constructor(
    public camera: Camera,
    public credentials: { username: string; password: string },
    private guard: NetworkGuard,
    private log: Diagnostics,
    source: string,
  ) {
    const epoch = guard.epoch;
    this.epoch = epoch;
    this.source = source;
    this.agent = new http.Agent({
      keepAlive: false,
      maxSockets: 1,
      localAddress: source,
    });
    const sockets = new Set<net.Socket>();
    const agent = this.agent;
    const addRequest = (agent as any).addRequest.bind(agent);
    (agent as any).addRequest = (req: http.ClientRequest, options: any) => {
      const signal = this.readSignal.getStore();
      const abort = () => req.destroy(cancelled());
      if (signal) {
        signal.addEventListener("abort", abort, { once: true });
        req.once("close", () => signal.removeEventListener("abort", abort));
      }
      addRequest(req, options);
      if (signal?.aborted) abort();
    };
    agent.createConnection = ((options: any, cb: any) => {
      try {
        guard.ensureEpoch(epoch);
        if (
          this.closed ||
          String(options.host ?? options.hostname) !== camera.ip
        )
          throw new Error("Destination caméra non autorisée.");
        const s = net.createConnection({
          ...options,
          host: camera.ip,
          localAddress: source,
        });
        sockets.add(s);
        s.on("close", () => sockets.delete(s));
        return s;
      } catch (e) {
        queueMicrotask(() => cb(e));
        return undefined;
      }
    }) as any;
    this.cam = new Cam({
      hostname: camera.ip,
      port: camera.port,
      path: camera.path,
      ...credentials,
      autoconnect: false,
      timeout: 5000,
      preserveAddress: true,
      agent,
    } as any);
    // The pinned library interpolates Username directly into its SOAP header.
    // Escape only the XML representation; Digest/RTSP keep the original value.
    const envelopeHeader = this.cam._envelopeHeader.bind(this.cam);
    this.cam._envelopeHeader = (...args: any[]) =>
      envelopeHeader(...args).replace(
        `<Username>${credentials.username}</Username>`,
        `<Username>${xmlEscape(credentials.username)}</Username>`,
      );
    const request = this.cam._request.bind(this.cam);
    this.cam._request = (options: any, originalCallback: any) => {
      const signal = this.readSignal.getStore();
      const cb = (...args: any[]) => {
        try {
          originalCallback(...args);
        } catch (e) {
          for (const reject of this.pending) reject(e);
          this.destroy();
        }
      };
      if (this.closed) return cb(new Error("Connexion fermée."));
      if (options.url)
        return cb(new Error("URL de service alternative refusée."));
      guard
        .assert(camera.ip)
        .then(() => {
          signal?.throwIfAborted();
          guard.ensureEpoch(epoch);
          if (this.closed) throw new Error("Connexion fermée.");
          request(options, cb);
        })
        .catch(cb);
    };
    this.cam.on("warning", () =>
      log.add("attention", "ONVIF", "Une capacité média n’a pas pu être lue."),
    );
    this.cam.on("error", () => {});
    this.cam.on("rawRequest", (xml: string) => {
      if (
        /<(?:\w+:)?(?:Set(?:NetworkInterfaces|NetworkDefaultGateway|DNS|VideoEncoderConfiguration|ImagingSettings|SystemDateAndTime|SystemFactoryDefault|OSD)|DeleteOSD|CreateOSD)\b/.test(
          xml,
        )
      )
        this.writeAttempts++;
    });
    this.destroy = () => {
      this.closed = true;
      this.camera.status = "Connexion fermée · à reconnecter";
      for (const reject of this.pending)
        reject(
          new Error(
            "Connexion interrompue. Reconnectez puis relisez l’état avant une nouvelle écriture.",
          ),
        );
      this.pending.clear();
      for (const child of this.webProcesses) child.kill();
      this.webProcesses.clear();
      for (const s of sockets) s.destroy();
      agent.destroy();
    };
  }
  destroy: () => void;
  private async readRetry<T>(
    action: string,
    readOnly: boolean,
    work: () => Promise<T>,
  ) {
    const signal = this.readSignal.getStore();
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      if (this.closed) throw new Error("Connexion fermée.");
      try {
        return await work();
      } catch (error) {
        signal?.throwIfAborted();
        // Some devices intermittently accept TCP without completing a reply.
        // Retry only reads with transport errors, never authentication failures or writes.
        const message = error instanceof Error ? error.message : String(error);
        if (
          !readOnly ||
          this.closed ||
          attempt >= 2 ||
          !/Network timeout|\b(?:ETIMEDOUT|ECONNRESET|EPIPE)\b/i.test(message)
        )
          throw error;
        this.log.add(
          "attention",
          "Reprise de lecture",
          `${action} : nouvelle tentative ${attempt + 2}/3 après interruption réseau.`,
          this.camera.ip,
        );
        await abortable(
          new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1))),
          signal,
        );
      }
    }
  }
  private requestResult<T>(
    invoke: (done: (error: any, value?: T) => void) => void,
    timeout: number,
  ): Promise<T> {
    let rejectPending!: (reason: unknown) => void;
    const result = new Promise<T>((resolve, reject) => {
      rejectPending = reject;
      this.pending.add(reject);
      try {
        invoke((error, value) => (error ? reject(error) : resolve(value as T)));
      } catch (error) {
        reject(error);
      }
    });
    return bounded(abortable(result, this.readSignal.getStore()), timeout, () =>
      this.destroy(),
    ).finally(() => this.pending.delete(rejectPending));
  }
  async call(method: string, ...args: any[]): Promise<any> {
    if (this.closed) throw new Error("Reconnectez cette caméra.");
    if (typeof this.cam[method] !== "function")
      throw new Error("Fonction non implémentée par la bibliothèque ONVIF.");
    return this.serialized(() =>
      this.readRetry(
        method,
        method === "connect" || /^get[A-Z]/.test(method),
        () =>
          this.requestResult(
            (done) => this.cam[method](...args, done),
            method === "connect" ? 22000 : 15000,
          ),
      ),
    );
  }
  get mediaNamespace() {
    return this.cam.media2Support
      ? "http://www.onvif.org/ver20/media/wsdl"
      : "http://www.onvif.org/ver10/media/wsdl";
  }
  async vendorRequest(endpoint: string, content = ""): Promise<string> {
    const allowed = Object.values(vendorGroups);
    const read = allowed.some((g) => g.read === endpoint);
    if (
      !read &&
      !allowed.some((g) => g.write === endpoint) &&
      !vendorExtraWrites.includes(endpoint)
    )
      throw Error("Commande caméra non autorisée.");
    const encode = (value: string) => {
      if (!/^[\x20-\x7e]*$/.test(value))
        throw Error("Identifiants non compatibles avec cet adaptateur web.");
      const bytes = Buffer.alloc(Math.ceil(value.length / 8) * 8);
      bytes.write(value, "latin1");
      // Same DES ECB/zero padding as the device's WebLogin implementation.
      // A repeated 3DES key is DES-compatible without OpenSSL's legacy provider.
      const cipher = createCipheriv(
        "des-ede3",
        Buffer.from("WebLogin".repeat(3)),
        null,
      );
      cipher.setAutoPadding(false);
      return Buffer.concat([cipher.update(bytes), cipher.final()]).toString(
        "hex",
      );
    };
    const body =
      '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://www.w3.org/2001/12/soap-envelope"><soap:Header><userid>' +
      encode(this.credentials.username) +
      "</userid><passwd>" +
      encode(this.credentials.password) +
      "</passwd></soap:Header><soap:Body>" +
      content +
      "</soap:Body></soap:Envelope>";
    return this.serialized(() =>
      this.readRetry(endpoint, read, async () => {
        await this.guard.assert(this.camera.ip);
        this.guard.ensureEpoch(this.epoch);
        if (this.closed) throw Error("Connexion fermée.");
        const accept = (status: number, xml: string) => {
          if (status === 401 || status === 403)
            throw Error("Authentification caméra refusée.");
          if (status === 404 || /ActionNotSupported|HTTP 404/i.test(xml))
            throw Error("ActionNotSupported : API web non disponible.");
          // 202/204 acknowledge a write, but do not confirm its application.
          // Callers always read back the setting before reporting success.
          if (
            (read ? status !== 200 : status < 200 || status >= 300) ||
            /<(?:[\w-]+:)?Fault\b/.test(xml)
          )
            throw Error("API web : réponse refusée (HTTP " + status + ").");
          return xml;
        };
        if (process.platform === "darwin") {
          if (!read) this.writeAttempts++;
          const result = await vendorHttpMac(
            {
              ip: this.camera.ip,
              port: this.camera.port,
              source: this.source,
              endpoint,
              body,
              signal: this.readSignal.getStore(),
            },
            this.webProcesses,
          );
          this.guard.ensureEpoch(this.epoch);
          if (this.closed) throw Error("Connexion fermée.");
          return accept(result.status, result.xml);
        }
        return new Promise<string>((resolve, reject) => {
          const req = http.request(
            {
              hostname: this.camera.ip,
              port: this.camera.port,
              path: endpoint,
              method: "POST",
              agent: this.agent,
              // This firmware dispatches SOAP instead if a charset is appended.
              headers: {
                "Content-type": "application/x-www-form-urlencoded",
                "X-Requested-With": "XMLHttpRequest",
                "Content-Length": Buffer.byteLength(body),
                Connection: "close",
              },
            },
            (res) => {
              const chunks: Buffer[] = [];
              let size = 0;
              res.on("data", (b: Buffer) => {
                size += b.length;
                if (size > 1024 * 1024)
                  req.destroy(Error("Réponse caméra trop volumineuse."));
                else chunks.push(b);
              });
              res.on("error", reject);
              res.on("end", () => {
                clearTimeout(timer);
                const xml = Buffer.concat(chunks).toString("utf8");
                try {
                  resolve(accept(res.statusCode ?? 0, xml));
                } catch (error) {
                  reject(error);
                }
              });
            },
          );
          const timer = setTimeout(
            () => req.destroy(Error("Network timeout")),
            6000,
          );
          req.once("error", (error) => {
            clearTimeout(timer);
            reject(error);
          });
          req.once("close", () => clearTimeout(timer));
          if (!read) this.writeAttempts++;
          req.end(body);
        });
      }),
    );
  }
  async soap(
    action:
      | "SetSystemDateAndTime"
      | "SetSystemFactoryDefault"
      | "GetSystemDateAndTime"
      | "GetOSDs"
      | "GetOSDOptions"
      | "CreateOSD"
      | "SetOSD"
      | "GetVideoEncoderConfiguration"
      | "GetVideoEncoderConfigurations"
      | "SetVideoEncoderConfiguration"
      | "SetNetworkInterfaces",
    content = "",
    device = false,
  ): Promise<string> {
    return this.serialized(() => this.soapRequest(action, content, device));
  }
  private async soapRequest(
    action: string,
    content: string,
    device: boolean,
  ): Promise<string> {
    if (this.closed) throw new Error("Reconnectez cette caméra.");
    if (device && action === "GetSystemDateAndTime") {
      // Use the same device-clock exchange as connection bootstrap (including
      // authenticated fallback). Keep the raw XML: the library's Date fallback
      // must never be mistaken for a verified UTC value returned by the camera.
      return this.readRetry(action, true, () =>
        this.requestResult<string>((done) => {
          this.cam.getSystemDateAndTime(
            (error: unknown, _date: unknown, xml: string) => {
              if (error) done(error);
              else if (!xml) done(Error("Réponse ONVIF complète absente."));
              else done(null, xml);
            },
          );
        }, 15000),
      );
    }
    let raw = "";
    const capture = (xml: string) => {
      if (xml.includes(action + "Response")) raw = xml;
    };
    this.cam.on("rawResponse", capture);
    try {
      return await this.readRetry(action, action.startsWith("Get"), () =>
        this.requestResult<string>((done) => {
          this.cam._request(
            {
              service: device
                ? undefined
                : this.cam.media2Support
                  ? "media2"
                  : "media",
              body:
                this.cam._envelopeHeader() +
                "<sz:" +
                action +
                ' xmlns:sz="' +
                (device
                  ? "http://www.onvif.org/ver10/device/wsdl"
                  : this.mediaNamespace) +
                '">' +
                content +
                "</sz:" +
                action +
                ">" +
                this.cam._envelopeFooter(),
            },
            (err: unknown) => {
              if (err) done(err);
              else if (!raw) done(new Error("Réponse ONVIF complète absente."));
              else done(null, raw);
            },
          );
        }, 15000),
      );
    } finally {
      this.cam.removeListener("rawResponse", capture);
    }
  }
  async setIPv4(
    interfaceToken: string,
    dhcp: boolean,
    manual?: { address: string; prefixLength: number }[],
  ) {
    const addresses = (manual ?? [])
      .map(
        (x) =>
          "<tt:Manual><tt:Address>" +
          xmlEscape(x.address) +
          "</tt:Address><tt:PrefixLength>" +
          x.prefixLength +
          "</tt:PrefixLength></tt:Manual>",
      )
      .join("");
    return this.soap(
      "SetNetworkInterfaces",
      "<sz:InterfaceToken>" +
        xmlEscape(interfaceToken) +
        '</sz:InterfaceToken><sz:NetworkInterface xmlns:tt="http://www.onvif.org/ver10/schema"><tt:IPv4><tt:Enabled>true</tt:Enabled>' +
        addresses +
        "<tt:DHCP>" +
        dhcp +
        "</tt:DHCP></tt:IPv4></sz:NetworkInterface>",
      true,
    );
  }
  async encoderXML(token: string) {
    return this.cam.media2Support
      ? this.soap("GetVideoEncoderConfigurations")
      : this.soap(
          "GetVideoEncoderConfiguration",
          "<sz:ConfigurationToken>" +
            xmlEscape(token) +
            "</sz:ConfigurationToken>",
        );
  }
  async videoEntry(configurationToken: string) {
    const profiles = array(await this.call("getProfiles"));
    const profile = profiles.find(
      (p) => token(p.videoEncoderConfiguration) === configurationToken,
    );
    if (!profile) throw Error("Encodeur absent des profils de la caméra.");
    return {
      profile: token(profile),
      name: profile.name,
      config: profile.videoEncoderConfiguration,
      options: await this.feature(() =>
        this.call("getVideoEncoderConfigurationOptions", {
          configurationToken: xmlEscape(configurationToken),
          profileToken: xmlEscape(token(profile)),
        }),
      ),
    };
  }
  async osdOptions(source: string) {
    return parseOSDOptions(
      await this.soap(
        "GetOSDOptions",
        "<sz:ConfigurationToken>" +
          xmlEscape(source) +
          "</sz:ConfigurationToken>",
      ),
    );
  }
  async osds() {
    return parseOSDs(await this.soap("GetOSDs"));
  }
  async feature(work: () => Promise<any>): Promise<Feature> {
    try {
      return { state: "available", data: await work() };
    } catch (e) {
      this.readSignal.getStore()?.throwIfAborted();
      const message = this.log.safe(e);
      return {
        state:
          /not supported|not implemented|ActionNotSupported|Optional Action/i.test(
            message,
          )
            ? "unsupported"
            : "error",
        message,
      };
    }
  }
  async connect() {
    await this.call("getSystemDateAndTime");
    try {
      await this.call("getServices", true);
    } catch (error) {
      // A transient failure is not evidence that Media2 is unsupported.
      if (
        !/ActionNotSupported|not supported|not implemented|Optional Action/i.test(
          String(error),
        )
      )
        throw error;
      await this.call("getCapabilities");
    }
    if (this.cam.uri?.media || this.cam.uri?.media2) {
      try {
        await this.call("getProfiles");
      } catch (error) {
        if (
          this.cam.media2Support &&
          this.cam.uri?.media &&
          /ActionNotSupported|not supported|not implemented|Optional Action/i.test(
            String(error),
          )
        ) {
          this.cam.media2Support = false;
          try {
            await this.call("getProfiles");
          } catch (fallback) {
            if (this.closed) throw fallback;
            this.log.add(
              "attention",
              "Profils vidéo",
              this.log.safe(fallback),
              this.camera.ip,
            );
          }
        } else {
          if (this.closed) throw error;
          this.log.add(
            "attention",
            "Profils vidéo",
            this.log.safe(error),
            this.camera.ip,
          );
        }
      }
      try {
        await this.call("getVideoSources");
        this.cam.getActiveSources();
      } catch (error) {
        // Keep successfully read profiles, including their source tokens.
        if (this.closed) throw error;
        this.log.add(
          "attention",
          "Sources vidéo",
          this.log.safe(error),
          this.camera.ip,
        );
      }
    }
    await this.identity();
  }
  async identity() {
    const info = await this.call("getDeviceInformation");
    Object.assign(this.camera, {
      model: String(info.model ?? ""),
      manufacturer: String(info.manufacturer ?? ""),
      firmware: String(info.firmwareVersion ?? ""),
      serial: String(info.serialNumber ?? ""),
      status: "Connectée · lecture seule",
    });
    this.camera.mac = undefined;
    try {
      const nics = array(await this.call("getNetworkInterfaces"));
      const nic = matchInterface(nics, this.camera.ip);
      this.camera.mac = String(nic.info?.hwAddress ?? "").toLowerCase();
    } catch {
      /* Network read is reported separately. */
    }
    if (!this.camera.mac) {
      this.readSignal.getStore()?.throwIfAborted();
      try {
        const lan = extractVendorGroup(
          parseVendorDocument(await this.vendorRequest("/getNetworkConfig")),
          "lan",
        );
        const mac = String(lan["@_MacAddress"] || "").toLowerCase();
        if (
          lan["@_IPAddress"] === this.camera.ip &&
          /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) &&
          !["00:00:00:00:00:00", "ff:ff:ff:ff:ff:ff"].includes(mac)
        )
          this.camera.mac = mac;
      } catch (error) {
        this.readSignal.getStore()?.throwIfAborted();
        this.log.add(
          "attention",
          "Lecture de l’identité réseau",
          this.log.safe(error),
          this.camera.ip,
        );
      }
    }
    return { ...this.camera };
  }
  async detail(
    onProgress?: (detail: CameraDetail) => void,
    cached?: CameraDetail,
  ): Promise<CameraDetail> {
    const loading = (): Feature => ({
      state: "loading",
      message: "Lecture en cours…",
    });
    const settled = (f?: Feature) =>
      f && f.state !== "loading" && f.state !== "error";
    const initial = (f?: Feature): Feature => (settled(f) ? f! : loading());
    const detail: CameraDetail = {
      camera: { ...this.camera },
      network: initial(cached?.network),
      gateway: initial(cached?.gateway),
      dns: initial(cached?.dns),
      capabilities: initial(cached?.capabilities),
      video: initial(cached?.video),
      image: initial(cached?.image),
      osd: initial(cached?.osd),
      profiles: array(this.cam.profiles),
      loading: true,
      lighting: {
        state: "unverified",
        message:
          "L’éclairage LED constructeur n’a pas d’intégration vérifiée. Le filtre infrarouge, s’il est exposé, figure dans Image. Utilisez l’interface web pour les autres réglages.",
      },
    };
    // Profile values were already read during authentication. Show them while
    // their editable ranges are being checked; never invent capabilities.
    if (!settled(cached?.video))
      detail.video = {
        ...loading(),
        data: detail.profiles
          .filter((p) => p.videoEncoderConfiguration)
          .map((p) => ({
            profile: token(p),
            name: p.name,
            config: p.videoEncoderConfiguration,
            options: loading(),
          })),
      };
    const publish = () => {
      this.readSignal?.getStore()?.throwIfAborted();
      onProgress?.({ ...detail, profiles: [...detail.profiles] });
    };
    const read = async (
      key: "network" | "gateway" | "dns" | "capabilities" | "image",
      work: () => Promise<any>,
    ) => {
      if (!settled(detail[key])) {
        detail[key] = await this.feature(work);
        publish();
      }
    };
    const videoComplete =
      settled(cached?.video) &&
      array(cached?.video.data).every((e) => settled(e.options));
    const osdComplete =
      settled(cached?.osd) &&
      array(cached?.osd.data?.options).every((o) => settled(o.result));
    if (!videoComplete) detail.video = { ...detail.video, ...loading() };
    if (!osdComplete) detail.osd = { ...detail.osd, ...loading() };
    publish();
    let profilesRead: Promise<any[]> | undefined;
    const profilesForRead = () =>
      (profilesRead ??= (async () => {
        const profiles =
          cached &&
          (cached.profiles.length || cached.video.state === "available")
            ? cached.profiles
            : array(await this.call("getProfiles"));
        detail.profiles = profiles;
        if (!videoComplete)
          detail.video = {
            ...loading(),
            data: profiles
              .filter((p) => p.videoEncoderConfiguration)
              .map((p) => ({
                profile: token(p),
                name: p.name,
                config: p.videoEncoderConfiguration,
                options: loading(),
              })),
          };
        publish();
        return profiles;
      })());
    // Three independent lanes: a slow optional feature must not hide network,
    // video or OSD values that have already arrived. Each lane sends one read
    // at a time, keeping the previous maximum of three concurrent requests.
    const jobs = [
      async () => {
        await read("network", async () =>
          array(await this.call("getNetworkInterfaces")),
        );
        await read("gateway", () => this.call("getNetworkDefaultGateway"));
        await read("dns", () => this.call("getDNS"));
      },
      async () => {
        if (videoComplete) return;
        detail.video = await this.feature(async () => {
          // Reuse profiles read during this authenticated session. A manual
          // refresh / write validation (no cached snapshot) rereads the device.
          const profiles = await profilesForRead();
          const out = [];
          for (const p of profiles.slice(0, 16)) {
            const c = p.videoEncoderConfiguration;
            if (!c) continue;
            const previous = array(cached?.video.data).find(
              (e) => e.profile === token(p),
            );
            const options = settled(previous?.options)
              ? previous.options
              : await this.feature(() =>
                  this.call("getVideoEncoderConfigurationOptions", {
                    configurationToken: xmlEscape(token(c)),
                    profileToken: xmlEscape(token(p)),
                  }),
                );
            out.push({ profile: token(p), name: p.name, config: c, options });
          }
          return out;
        });
        publish();
      },
      async () => {
        if (osdComplete) return;
        detail.osd = await this.feature(async () => {
          // Source tokens can be missing after a partial authentication read.
          // Share the profile request, rather than reporting absent OSD options.
          const web = await this.feature(async () => {
            const doc = parseVendorDocument(
              await this.vendorRequest("/getMediaVideoConfig"),
            );
            const data = extractVendorGroup(doc, "overlay");
            return readWebOSD(data);
          });
          if (web.state === "available")
            return { strategy: "web", web: web.data };
          const profiles = await profilesForRead();
          const previous = settled(cached?.osd) ? cached?.osd.data : undefined;
          const settings =
            previous?.settings ??
            (await this.osds()).map(({ xml, signature, ...o }) => o);
          const sourceTokens = [
            ...new Set(
              profiles
                .map((p) => token(p.videoSourceConfiguration))
                .filter(Boolean),
            ),
          ];
          const options = [];
          for (const source of sourceTokens.slice(0, 8)) {
            const old = array(previous?.options).find(
              (o) => o.source === source,
            )?.result;
            options.push({
              source,
              result: settled(old)
                ? old
                : await this.feature(() => this.osdOptions(source)),
            });
          }
          return { settings, options, strategy: "delete" };
        });
        publish();
      },
      () => read("capabilities", () => this.call("getCapabilities")),
      async () => {
        await read("image", async () => {
          let source = this.cam.activeSource?.sourceToken;
          if (!source) {
            const profiles = await profilesForRead();
            const sources = [
              ...new Set(
                profiles
                  .map((p) => p.videoSourceConfiguration?.sourceToken)
                  .filter(Boolean),
              ),
            ];
            if (sources.length === 1) source = sources[0];
          }
          if (!source)
            throw Error(
              "Source vidéo absente ou ambiguë ; réglages d’image non vérifiés.",
            );
          return {
            sourceToken: source,
            settings: await this.call("getImagingSettings", {
              token: xmlEscape(source),
            }),
            options: await this.call("getVideoSourceOptions", {
              token: xmlEscape(source),
            }),
          };
        });
      },
    ];
    let next = 0;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (next < jobs.length) {
          this.readSignal?.getStore()?.throwIfAborted();
          await jobs[next++]();
        }
      }),
    );
    detail.loading = false;
    publish();
    return detail;
  }
  async stream(profile: string) {
    if (!array(this.cam.profiles).some((p) => token(p) === profile))
      throw new Error("Profil vidéo absent de la caméra sélectionnée.");
    const result = await this.call("getStreamUri", {
      protocol: "RTSP",
      profileToken: xmlEscape(profile),
    });
    const uri = new URL(result.uri);
    if (uri.protocol !== "rtsp:" || uri.hostname !== this.camera.ip)
      throw new Error(
        "Flux refusé : seul RTSP unicast vers l’IP de cette caméra est accepté.",
      );
    uri.username = this.credentials.username;
    uri.password = this.credentials.password;
    uri.hash = "";
    return uri.toString();
  }
}
export function videoOptions(entry: any, encoding?: string) {
  return videoCapabilities(entry, encoding);
}
export function validateVideo(
  entry: any,
  v: {
    width: number;
    height: number;
    fps: number;
    codec?: string;
    constantBitrate?: boolean;
    govLength?: number;
    h264Profile?: string;
    quality?: number;
    bitrate?: number;
  },
) {
  if (entry?.options?.state !== "available")
    throw new Error("Options vidéo non vérifiées.");
  const o = videoOptions(entry, v.codec);
  if (
    v.h264Profile !== undefined &&
    ((v.codec ?? entry.config.encoding) !== "H264" ||
      !o.profiles.includes(v.h264Profile))
  )
    throw new Error("Profil H.264 non annoncé par la caméra.");
  if (v.constantBitrate !== undefined && !o.constantBitrate)
    throw new Error("Contrôle du débit non annoncé par la caméra.");
  if (v.govLength !== undefined) {
    inRange(v.govLength, o.gov, "Intervalle I-Frame");
    if (o.govValues.length && !o.govValues.includes(v.govLength))
      throw Error("Intervalle I-Frame non proposé par la caméra.");
  }
  const resolution = o.resolutions.find(
    (r) => r.width === v.width && r.height === v.height,
  );
  if (!resolution) throw new Error("Résolution non proposée par la caméra.");
  inRange(v.fps, o.fps, "FPS");
  if (resolution.frameRateRange)
    inRange(v.fps, resolution.frameRateRange, "FPS pour cette résolution");
  if (o.fpsValues.length && !o.fpsValues.includes(v.fps))
    throw new Error("FPS non proposés par la caméra.");
  if (
    v.constantBitrate !== undefined &&
    entry.config.rateControl?.averageBitRate > 0
  )
    throw new Error(
      "Un débit moyen prioritaire est actif. Réglez ce mode depuis l’interface web avant de changer CBR/VBR.",
    );
  if (v.quality !== undefined) inRange(v.quality, o.quality, "Qualité");
  if (v.bitrate !== undefined) inRange(v.bitrate, o.bitrate, "Débit");
  if (v.bitrate !== undefined && resolution.bitrateRange)
    inRange(v.bitrate, resolution.bitrateRange, "Débit pour cette résolution");
}
export function inRange(v: number, range: any, label: string) {
  if (
    !range ||
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max) ||
    !Number.isFinite(v) ||
    v < range.min ||
    v > range.max
  )
    throw new Error(`${label} hors des capacités vérifiées de la caméra.`);
}
