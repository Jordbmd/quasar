import { readDaylight } from "./daylight";
import { FactoryReset } from "./factory-reset";
import {
  resetConfirmation,
  type FactoryResetPlan,
} from "../shared/factory-reset";
import { addressRows } from "./addressing";
import type { AddressPlan } from "../shared/addressing";
import { readWebOSD, changeWebOSD, webOSDBody } from "./web-osd";
import { ProfileJournal } from "./profile-journal";
import {
  readVendorProfile,
  parseVendorDocument,
  extractVendorGroup,
  buildVendorChange,
  vendorValue,
  vendorFingerprint,
  vendorBody,
  vendorBackup,
  vendorWrites,
  type VendorSnapshot,
} from "./vendor-profile";
import { vendorGroups, type VendorGroup } from "../shared/vendor-profile";
import { compareFields, videoReadback } from "./write-verification";
import {
  issueCode,
  type OperationIssue,
  type FieldVerification,
  type ProfileRun,
} from "../shared/profile-journal";
import {
  parseCameraClock,
  clockSettings,
  cameraClockPayload,
  fixedClockSettings,
  hasDSTClockError,
  localClockMatches,
  clockTimezoneMatches,
} from "./camera-clock";
import { DefaultsManager, DefaultsStore } from "./defaults";
import { validateDefaults, type DefaultsProgress } from "../shared/defaults";
import { encoderPayload, encoderFingerprint } from "./encoding";
import net from "node:net";
import { WebSocket } from "ws";
import {
  OSDStore,
  osdPayload,
  signature,
  newOSDPayload,
  validateOSD,
  parseXML,
  textOf,
} from "./osd";
import type { DiagnosticReport } from "../shared/types";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  Api,
  Camera,
  CameraDetail,
  CameraDetailUpdate,
  WriteResult,
  CameraSession,
} from "../shared/types";
import { NetworkGuard } from "./network";
import { Diagnostics, reconnect } from "./diagnostics";
import {
  CameraConnection,
  array,
  token,
  matchInterface,
  xmlEscape,
  escapeTree,
  validateVideo,
  inRange,
} from "./onvif";
import {
  discoverOnInterface,
  markAmbiguity,
  identityMatches,
} from "./discovery";
import { cameraAddress, prefix, host, sameSubnet } from "./ip";
import { VideoRelay } from "./video";
import { cancelled } from "./cancellation";
const id = z.string().uuid();
const ip = z.ipv4();
const finite = z.number().finite();
const osdFields = {
  text: z.string().max(128).optional(),
  textType: z.enum(["Plain", "Date", "Time", "DateAndTime"]).optional(),
  position: z
    .enum(["UpperLeft", "UpperRight", "LowerLeft", "LowerRight", "Custom"])
    .optional(),
  fontSize: finite.int().min(0).max(1000).optional(),
  dateFormat: z.string().min(1).max(128).optional(),
  timeFormat: z.string().min(1).max(128).optional(),
  x: finite.min(-1).max(1).optional(),
  y: finite.min(-1).max(1).optional(),
};
const osdCorner = z.enum([
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
  "hidden",
  "custom",
]);
export const schemas = {
  previewFactoryReset: z
    .object({
      ids: z
        .array(id)
        .min(1)
        .max(256)
        .refine((ids) => new Set(ids).size === ids.length),
    })
    .strict(),
  applyFactoryReset: z
    .object({ planId: id, confirmation: z.literal(resetConfirmation) })
    .strict(),
  previewAddresses: z
    .object({ start: z.number().int().min(1).max(244) })
    .strict(),
  applyAddresses: z.object({ planId: id }).strict(),
  resolveIPConflict: z.object({ id, isolated: z.literal(true) }).strict(),
  setWebOSD: z
    .object({
      id,
      values: z
        .object({
          enabled: z.boolean(),
          title: z.string().max(64),
          titlePosition: osdCorner,
          timePosition: osdCorner,
        })
        .strict(),
    })
    .strict(),
  syncCameraTime: z
    .object({ id, timezone: z.enum(["Europe/Paris", "UTC"]) })
    .strict(),
  getDefaults: z.undefined(),
  auditDefaults: z
    .object({
      ids: z
        .array(id)
        .min(1)
        .max(256)
        .refine((ids) => new Set(ids).size === ids.length),
    })
    .strict(),
  listDefaultsRuns: z.undefined(),
  getDefaultsRun: z.object({ id }).strict(),
  exportDefaultsRun: z.object({ id }).strict(),
  saveDefaults: z.unknown().transform((v) => validateDefaults(v)),
  previewDefaults: z
    .object({
      ids: z
        .array(id)
        .min(1)
        .max(256)
        .refine((ids) => new Set(ids).size === ids.length, "Cibles dupliquées"),
    })
    .strict(),
  applyDefaults: z.object({ planId: id }).strict(),
  state: z.undefined(),
  discover: z.undefined(),
  addCamera: z
    .object({ ip, port: z.number().int().min(1).max(65535) })
    .strict(),
  connectSession: z
    .object({
      username: z.string().max(128),
      password: z.string().max(256),
    })
    .strict(),
  disconnectSession: z.undefined(),
  retryConnections: z.undefined(),
  selectCamera: z
    .object({ id, requestId: z.string().max(100).optional() })
    .strict(),
  readCamera: z
    .object({ id, requestId: z.string().max(100).optional() })
    .strict(),
  cancelCameraRead: z.undefined(),
  changeIP: z
    .object({ id, address: ip, mask: ip, isolated: z.boolean() })
    .strict(),
  setVideo: z
    .object({
      id,
      token: z.string().min(1).max(256),
      width: finite.int().positive(),
      height: finite.int().positive(),
      fps: finite.positive(),
      codec: z.enum(["H264", "H265", "JPEG", "MPEG4"]).optional(),
      constantBitrate: z.boolean().optional(),
      govLength: finite.int().positive().optional(),
      h264Profile: z.enum(["Baseline", "Main", "Extended", "High"]).optional(),
      quality: finite.optional(),
      bitrate: finite.int().positive().optional(),
    })
    .strict(),
  setImage: z
    .object({
      id,
      values: z.record(
        z.enum([
          "brightness",
          "contrast",
          "colorSaturation",
          "sharpness",
          "irCutFilter",
        ]),
        z.union([finite, z.enum(["ON", "OFF", "AUTO"])]),
      ),
    })
    .strict(),
  setOSD: z
    .object({
      id,
      token: z.string().min(1).max(256),
      ...osdFields,
    })
    .strict(),
  createOSD: z
    .object({ id, source: z.string().min(1).max(256), ...osdFields })
    .strict(),
  disableOSD: z
    .object({
      id,
      tokens: z.array(z.string().min(1).max(256)).min(1).max(64).optional(),
    })
    .strict(),
  restoreOSD: z.object({ id }).strict(),
  diagnose: z.object({ id }).strict(),
  setCameraNetwork: z
    .object({
      id,
      dhcp: z.boolean().optional(),
      address: ip.optional(),
      mask: ip.optional(),
      gateway: z.union([ip, z.literal("")]).optional(),
      dns: z.array(ip).max(4).optional(),
      isolated: z.boolean(),
    })
    .strict(),
  previewProfiles: z.object({ id }).strict(),
  startVideo: z.object({ id, profile: z.string().min(1).max(256) }).strict(),
  stopVideo: z.undefined(),
  openWeb: z.object({ id }).strict(),
  exportLogs: z.undefined(),
  copyLogs: z.undefined(),
};
export class CameraService {
  private discoveryRead?: { at: number; epoch: number };
  private addressPlan?: {
    plan: AddressPlan;
    epoch: number;
    session: number;
    cameras: Camera[];
  };
  private defaults: DefaultsManager;
  private factoryReset: FactoryReset;
  onFactoryResetProgress?: (plan: FactoryResetPlan) => void;
  exportProfileRun?: (run: ProfileRun) => Promise<string>;
  onDefaultsProgress?: (progress: DefaultsProgress) => void;
  onCameraDetail?: (update: CameraDetailUpdate) => void;
  cameras: Camera[] = [];
  connections = new Map<string, CameraConnection>();
  details = new Map<string, CameraDetail>();
  uncertain = new Set<string>();
  reports: DiagnosticReport[] = [];
  abort = new AbortController();
  private credentials?: { username: string; password: string };
  private sessionGeneration = 0;
  private attempted = new Set<string>();
  private detailRequest?: {
    controller: AbortController;
    promise: Promise<CameraDetail>;
  };
  private videoRequest?: AbortController;
  onPreviewLighting: (update: {
    id: string;
    url: string;
    warning?: string;
  }) => void = () => {};
  private previewLighting: Promise<unknown> = Promise.resolve();
  async finishPreviewLighting() {
    await this.previewLighting.catch(() => {});
  }
  async cancelCameraRead() {
    const request = this.detailRequest;
    request?.controller.abort(cancelled());
    if (request) await request.promise.catch(() => {});
  }
  private selectDetail(id: string, fresh = false, requestId?: string) {
    this.detailRequest?.controller.abort(cancelled());
    const controller = new AbortController();
    const promise = (async () => {
      const conn = await this.connection(id);
      return conn.withReadSignal(controller.signal, () =>
        this.cameraDetail(id, fresh, controller.signal, requestId),
      );
    })();
    const request = { controller, promise };
    this.detailRequest = request;
    return promise.finally(() => {
      if (this.detailRequest === request) this.detailRequest = undefined;
    });
  }
  async stopVideo() {
    this.videoRequest?.abort(cancelled());
    this.videoRequest = undefined;
    await this.video.stop();
  }
  constructor(
    public guard: NetworkGuard,
    public log: Diagnostics,
    public video: VideoRelay,
    private confirm: (text: string) => Promise<boolean>,
    private open: (url: string) => Promise<void>,
    private exportFile: () => Promise<string>,
    private osdStore: OSDStore,
    defaultsStore = new DefaultsStore(),
    public profileJournal = new ProfileJournal(),
  ) {
    this.factoryReset = new FactoryReset({
      context: () => `${this.guard.epoch}:${this.sessionGeneration}`,
      read: async (id) => ({ ...(await this.writeGuard(id)).camera }),
      check: async (camera) => {
        const conn = await this.approve(
          camera.id,
          "Remise à zéro d’usine",
          false,
        );
        if (
          conn.camera.ip !== camera.ip ||
          !identityMatches(camera, conn.camera)
        )
          throw Error("Identité ou adresse modifiée depuis la préparation.");
      },
      send: async (id) => {
        const conn = await this.connection(id);
        this.uncertain.add(id);
        try {
          await conn.soap(
            "SetSystemFactoryDefault",
            "<sz:FactoryDefault>Hard</sz:FactoryDefault>",
            true,
          );
          this.log.add(
            "attention",
            "Reset usine",
            "Commande ONVIF Hard acceptée ; état d’usine non encore vérifié.",
            conn.camera.ip,
          );
        } catch (error) {
          this.log.add(
            "erreur",
            "Reset usine",
            this.log.safe(error),
            conn.camera.ip,
          );
          throw error;
        } finally {
          conn.destroy();
          this.connections.delete(id);
          this.details.delete(id);
        }
      },
      confirm: (message) => this.confirm(message),
      save: (plan) => this.profileJournal.saveFactoryReset(plan),
      finish: async () => {
        await this.disconnectSession();
        this.cameras = [];
        this.addressPlan = undefined;
      },
      safe: (error) => this.log.safe(error),
      progress: (plan) => this.onFactoryResetProgress?.(plan),
    });
    this.defaults = new DefaultsManager(
      defaultsStore,
      {
        epoch: () => guard.epoch,
        camera: (id) => this.camera(id),
        read: async (id) => {
          const conn = await this.connection(id);
          await conn.identity();
          const vendor = await readVendorProfile(conn);
          const unavailable = {
            state: "unverified" as const,
            message: "Lecture par l’API web de la caméra.",
          };
          const detail: CameraDetail =
            vendor.state === "available"
              ? {
                  camera: { ...conn.camera },
                  network: unavailable,
                  gateway: unavailable,
                  dns: unavailable,
                  image: unavailable,
                  video: unavailable,
                  osd: unavailable,
                  lighting: unavailable,
                  capabilities: unavailable,
                  profiles: [],
                  vendor,
                }
              : await conn.detail();
          detail.vendor = vendor;
          detail.daylight = await conn.feature(async () => {
            const { day } = await readDaylight(conn);
            return { day };
          });
          detail.osdRestoreAvailable = !!(await this.osdStore.read(
            detail.camera,
          ));
          detail.clock = await conn.feature(async () =>
            parseCameraClock(await conn.soap("GetSystemDateAndTime", "", true)),
          );
          return detail;
        },
        check: async (camera) => {
          const conn = await this.writeGuard(camera.id);
          if (!identityMatches(camera, conn.camera))
            throw Error("Identité de caméra modifiée.");
        },
        write: async (action) => {
          try {
            if (action.method === "setDayMode")
              return await this.setDayMode(action.input.id);
            if (action.method === "setVendorDefaults")
              return await this.setVendorDefaults(action.input);
            return await this.dispatch(action.method, action.input);
          } finally {
            this.details.delete(action.input.id);
          }
        },
        progress: (p) => this.onDefaultsProgress?.(p),
        safe: (e) => this.log.safe(e),
      },
      profileJournal,
    );
    guard.onSuspend(() => {
      void this.cancelCameraRead();
      this.videoRequest?.abort(cancelled());
      this.abort.abort();
      this.abort = new AbortController();
      for (const c of this.connections.values()) c.destroy();
      this.connections.clear();
      this.details.clear();
      this.attempted.clear();
      this.cameras = [];
      void video.stop();
    });
  }
  session(): CameraSession {
    return {
      active: !!this.credentials,
      username: this.credentials?.username,
      connected: this.cameras.filter((c) => {
        const connection = this.connections.get(c.id);
        return (
          connection && !connection.closed && c.status.startsWith("Connectée")
        );
      }).length,
      total: this.cameras.length,
      failures: this.cameras
        .filter((c) => c.connectionError)
        .map((c) => ({
          id: c.id,
          ip: c.ip,
          message: c.connectionError!,
        })),
    };
  }
  async disconnectSession() {
    await this.cancelCameraRead();
    this.videoRequest?.abort(cancelled());
    this.sessionGeneration++;
    if (this.credentials) {
      this.credentials.password = "";
      this.credentials.username = "";
    }
    this.credentials = undefined;
    this.abort.abort();
    this.abort = new AbortController();
    for (const c of this.connections.values()) {
      c.destroy();
      c.credentials.password = "";
      c.credentials.username = "";
      if (c.cam) {
        c.cam.password = "";
        c.cam.username = "";
      }
    }
    this.connections.clear();
    this.details.clear();
    this.attempted.clear();
    for (const c of this.cameras) {
      c.status = "Découverte · non authentifiée";
      delete c.connectionError;
    }
    await this.video.stop();
    this.log.secrets.clear();
  }
  private async connectOne(c: Camera) {
    if (!this.credentials)
      throw new Error(
        "Connectez l’application avec les identifiants communs aux caméras.",
      );
    if (c.ambiguous)
      throw new Error(
        "Plusieurs caméras partagent cette adresse. Isolez la caméra avant de vous connecter.",
      );
    const generation = this.sessionGeneration;
    const a = await this.guard.assert(c.ip),
      epoch = this.guard.epoch;
    if (generation !== this.sessionGeneration || !this.credentials)
      throw new Error("Session fermée.");
    this.connections.get(c.id)?.destroy();
    this.details.delete(c.id);
    const conn = new CameraConnection(
      c,
      { ...this.credentials },
      this.guard,
      this.log,
      a.address,
    );
    this.connections.set(c.id, conn);
    c.status = "Connexion en cours";
    try {
      await conn.connect();
      this.guard.ensureEpoch(epoch);
      if (
        generation !== this.sessionGeneration ||
        conn.closed ||
        this.connections.get(c.id) !== conn
      )
        throw new Error("Connexion interrompue.");
      delete c.connectionError;
    } catch (error) {
      conn.destroy();
      if (this.connections.get(c.id) === conn) this.connections.delete(c.id);
      throw error;
    }
  }
  private async connectPending(retry = false) {
    if (!this.credentials) return;
    const epoch = this.guard.epoch,
      generation = this.sessionGeneration;
    const pending = this.cameras.filter((c) => {
      const conn = this.connections.get(c.id);
      return (
        (!conn || conn.closed || (retry && this.uncertain.has(c.id))) &&
        (retry || !this.attempted.has(c.id))
      );
    });
    // Bound concurrency, and never automatically retry a rejected password.
    let index = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, pending.length) }, async () => {
        while (index < pending.length) {
          this.guard.ensureEpoch(epoch);
          if (!this.credentials || generation !== this.sessionGeneration)
            return;
          const c = pending[index++];
          this.attempted.add(c.id);
          try {
            await this.connectOne(c);
          } catch (error) {
            this.guard.ensureEpoch(epoch);
            if (generation !== this.sessionGeneration)
              throw new Error("Session fermée.");
            c.status = "Erreur de connexion";
            c.connectionError = this.log.safe(error);
            this.log.add(
              "attention",
              "Connexion caméra",
              c.connectionError,
              c.ip,
            );
          }
        }
      }),
    );
    this.guard.ensureEpoch(epoch);
    if (generation !== this.sessionGeneration)
      throw new Error("Session fermée.");
  }
  private async cameraDetail(
    id: string,
    fresh = false,
    signal?: AbortSignal,
    requestId?: string,
  ) {
    const c = this.camera(id);
    if (c.connectionError) throw new Error(c.connectionError);
    const conn = await this.connection(id),
      epoch = this.guard.epoch;
    signal?.throwIfAborted();
    const cached = this.details.get(id);
    const hasErrors =
      cached &&
      ([
        cached.network,
        cached.gateway,
        cached.dns,
        cached.capabilities,
        cached.video,
        cached.image,
        cached.osd,
      ].some((f) => f?.state === "error") ||
        array(cached.video?.data).some((e) => e.options?.state === "error") ||
        array(cached.osd?.data?.options).some(
          (o) => o.result?.state === "error",
        ));
    if (cached && !fresh && !cached.loading && !hasErrors) return cached;
    if (fresh) await conn.identity();
    const restoreAvailable = !!(await this.osdStore.read(c));
    const publish = (detail: CameraDetail) => {
      signal?.throwIfAborted();
      this.guard.ensureEpoch(epoch);
      if (conn.closed || this.connections.get(id) !== conn)
        throw new Error("Connexion interrompue.");
      detail.osdRestoreAvailable = restoreAvailable;
      this.details.set(id, detail);
      if (requestId) this.onCameraDetail?.({ requestId, detail });
    };
    const detail = await conn.detail(publish, fresh ? undefined : cached);
    signal?.throwIfAborted();
    this.guard.ensureEpoch(epoch);
    if (conn.closed || this.connections.get(id) !== conn)
      throw new Error("Connexion interrompue.");
    detail.osdRestoreAvailable = restoreAvailable;
    signal?.throwIfAborted();
    this.details.set(id, detail);
    if (conn.writeAttempts === 0 && detail.network.state === "available")
      this.uncertain.delete(id);
    return detail;
  }
  camera(id: string) {
    const c = this.cameras.find((c) => c.id === id);
    if (!c)
      throw new Error(
        "Caméra inconnue. Relancez la découverte ou ajoutez son IP.",
      );
    return c;
  }
  async connection(id: string) {
    const c = this.camera(id);
    await this.guard.assert(c.ip);
    const conn = this.connections.get(id);
    if (!conn || conn.closed)
      throw new Error("Connectez cette caméra avec ses identifiants.");
    return conn;
  }
  merge(found: Omit<Camera, "id">[]) {
    for (const c of found) {
      let prev = this.cameras.find(
        (x) => x.ip === c.ip && x.endpoint === c.endpoint,
      );
      if (!prev) {
        const manual = this.cameras.find((x) => x.ip === c.ip && !x.endpoint);
        if (manual) {
          manual.endpoint = c.endpoint;
          prev = manual;
        }
      }
      if (!prev) this.cameras.push({ ...c, id: randomUUID() });
    }
    markAmbiguity(this.cameras);
    return this.cameras;
  }
  async discovery(authenticate = true) {
    const a = await this.guard.assert();
    const epoch = this.guard.epoch;
    const found = await discoverOnInterface(
      a.address,
      a.mask,
      this.abort.signal,
    );
    this.guard.ensureEpoch(epoch);
    this.log.add(
      "info",
      "Découverte terminée",
      `${found.length} réponse(s) sur ${a.id}`,
    );
    this.merge(found);
    this.discoveryRead = { at: Date.now(), epoch };
    if (authenticate) await this.connectPending();
    return this.cameras;
  }
  async conflict(c: Camera, target?: string) {
    // Reuse a very recent scan during the same operation. Identity and ARP are
    // still checked on every write; network changes invalidate this snapshot.
    if (
      !this.discoveryRead ||
      this.discoveryRead.epoch !== this.guard.epoch ||
      Date.now() - this.discoveryRead.at > 5000
    )
      await this.discovery(false);
    if (this.camera(c.id).ambiguous)
      throw new Error(
        "Plusieurs identités à cette IP. Écriture bloquée : isolez physiquement la caméra puis relancez une session réseau.",
      );
    const a = await this.guard.assert(c.ip);
    const observations = new Set<string>();
    for (let i = 0; i < 2; i++) {
      await this.guard.system.probe(c.ip, a.address);
      if (target) await this.guard.system.probe(target, a.address);
      const ns = await this.guard.system.neighbors(a.id);
      for (const n of ns.filter((n) => n.ip === c.ip)) observations.add(n.mac);
      if (
        target &&
        (ns.some((n) => n.ip === target) ||
          this.cameras.some((x) => x.ip === target && x.id !== c.id))
      )
        throw new Error(
          "Adresse cible déjà observée sur le réseau : écriture refusée.",
        );
    }
    if (
      observations.size > 1 ||
      (c.mac && [...observations].some((m) => m !== c.mac))
    ) {
      c.ambiguous = true;
      throw new Error(
        "Identités MAC contradictoires. Isolez physiquement la caméra.",
      );
    }
  }
  async writeGuard(id: string) {
    const c = this.camera(id);
    await this.guard.assert(c.ip);
    if (c.ambiguous) throw new Error("Identité ambiguë : écriture refusée.");
    if (this.uncertain.has(id))
      throw new Error(
        "Résultat précédent incertain : reconnectez puis relisez la caméra avant une nouvelle écriture.",
      );
    const conn = await this.connection(id);
    const before = { ...c };
    const current = await conn.identity();
    if (!identityMatches(before, current))
      throw new Error("Identité absente ou différente : écriture refusée.");
    return conn;
  }
  async approve(id: string, description: string, confirmation = true) {
    let conn = await this.writeGuard(id);
    const before = { ...conn.camera };
    await this.conflict(before);
    const epoch = this.guard.epoch;
    if (
      confirmation &&
      !(await this.confirm(
        `${before.model || "Caméra"} · ${before.ip}\nSérie : ${before.serial || "non disponible"} · MAC : ${before.mac || "non disponible"}\n\n${description}\n\nCette action modifie uniquement cette caméra. Continuer ?`,
      ))
    )
      throw new Error("Opération annulée.");
    this.guard.ensureEpoch(epoch);
    conn = await this.writeGuard(id);
    if (!identityMatches(before, conn.camera))
      throw new Error("Identité modifiée pendant la confirmation.");
    return conn;
  }
  async changeIP(
    v: Api["changeIP"]["input"],
    confirmed = false,
  ): Promise<WriteResult> {
    const c = this.camera(v.id),
      a = await this.guard.assert(c.ip);
    cameraAddress(
      v.address,
      v.mask,
      a.address,
      a.mask,
      this.guard.ownAddresses(),
    );

    let conn = await this.writeGuard(v.id);
    const old = { ...c };
    const nics = array(await conn.call("getNetworkInterfaces"));
    const nic = matchInterface(nics, c.ip);
    await this.conflict(c, v.address !== c.ip ? v.address : undefined);
    conn = await this.approve(
      v.id,
      `Ancienne IPv4 : ${JSON.stringify(nic.IPv4?.config)}\nNouvelle IPv4 : MANUEL ${v.address} / ${v.mask}\nDHCP désactivé sur l’interface caméra ${token(nic)}. Routeur et DNS caméra inchangés.\nIdentité et conflits d’adresse contrôlés. Une coupure temporaire est attendue.`,
      !confirmed,
    );
    await this.conflict(c, v.address !== c.ip ? v.address : undefined);
    const latestNIC = matchInterface(
      array(await conn.call("getNetworkInterfaces")),
      c.ip,
    );
    if (JSON.stringify(latestNIC) !== JSON.stringify(nic))
      throw new Error(
        "La configuration réseau caméra a changé pendant la confirmation. Relisez puis recommencez.",
      );
    const credentials = conn.credentials;
    await this.profileJournal.backupVendor(old, "network", JSON.stringify(nic));
    await this.video.stop();
    let acknowledged = false,
      reboot = false;
    const writeCount = conn.writeAttempts;
    this.uncertain.add(v.id);
    try {
      const manual = array(nic.IPv4?.config?.manual)
        .filter((x) => x.address !== old.ip && x.address !== v.address)
        .map((x) => ({
          address: String(x.address),
          prefixLength: Number(x.prefixLength),
        }));
      manual.push({ address: v.address, prefixLength: prefix(v.mask) });
      const reply = await conn.setIPv4(token(nic), false, manual);
      acknowledged = true;
      reboot = /RebootNeeded[^>]*>true</i.test(reply);
    } catch (e) {
      this.log.add(
        "attention",
        "Changement IP : résultat à vérifier",
        this.log.safe(e),
      );
    } finally {
      conn.destroy();
      this.connections.delete(v.id);
    }
    const sent = conn.writeAttempts > writeCount;
    if (!sent)
      return {
        sent: false,
        acknowledged: false,
        verified: false,
        message:
          "La commande n’a pas atteint la couche HTTP. Reconnectez et relisez avant une autre écriture.",
      };
    this.log.add(
      "info",
      "Commande IP remise au transport HTTP",
      `${old.ip} → ${v.address}`,
    );
    try {
      const verified = await reconnect(
        async () => {
          const network = await this.guard.assert(v.address);
          const candidate = { ...old, ip: v.address };
          const fresh = new CameraConnection(
            candidate,
            credentials,
            this.guard,
            this.log,
            network.address,
          );
          try {
            await fresh.connect();
            const read = array(await fresh.call("getNetworkInterfaces"));
            const ni = matchInterface(read, v.address);
            if (
              !identityMatches(old, candidate) ||
              ni.IPv4?.config?.DHCP !== false ||
              !array(ni.IPv4?.config?.manual).some(
                (x) =>
                  x.address === v.address && x.prefixLength === prefix(v.mask),
              )
            )
              throw new Error("Identité ou IPv4 non confirmée.");
            return { candidate, fresh };
          } catch (e) {
            fresh.destroy();
            throw e;
          }
        },
        () => true,
        4,
        1500,
      );
      Object.assign(c, verified.candidate);
      this.connections.set(c.id, verified.fresh);
      this.uncertain.delete(c.id);
      this.log.add(
        "info",
        "Configuration IP vérifiée",
        `${c.ip} · ${c.serial || c.mac}`,
      );
      return {
        sent: true,
        acknowledged,
        verified: true,
        message:
          "Nouvelle adresse, masque, DHCP désactivé et identité vérifiés par relecture.",
        camera: c,
      };
    } catch (e) {
      c.status = "Commande envoyée · configuration non vérifiée";
      return {
        sent: true,
        acknowledged,
        verified: false,
        message:
          (reboot
            ? "La caméra demande un redémarrage ; aucun redémarrage automatique. "
            : "") +
          "La configuration n’a pas pu être confirmée. Recherchez l’ancienne puis la nouvelle IP, reconnectez et relisez avant une autre écriture. " +
          this.log.safe(e),
      };
    }
  }
  async previewAddresses(start: number): Promise<AddressPlan> {
    this.addressPlan = undefined;
    const a = await this.guard.assert();
    if (!this.credentials)
      throw Error("Connectez d’abord l’application aux caméras.");
    if (!sameSubnet(a.address, "192.168.1.11", a.mask))
      throw Error(
        "Le profil casier utilise 192.168.1.x. L’Ethernet du Mac doit appartenir à ce réseau.",
      );
    await this.discovery(false);
    const neighbors = await this.guard.system.neighbors(a.id);
    const rows = addressRows(
      this.cameras,
      start,
      new Set(neighbors.map((n) => n.ip)),
      this.guard.ownAddresses(),
    );
    // Probe all proposed targets with bounded concurrency, without guessing that
    // a silent target is free. Discovery, ARP and identity are rechecked on apply.
    for (let i = 0; i < rows.length; i += 4)
      await Promise.all(
        rows
          .slice(i, i + 4)
          .filter((r) => r.state === "ready")
          .map((r) => this.guard.system.probe(r.to, a.address)),
      );
    const occupied = new Set(
      (await this.guard.system.neighbors(a.id)).map((n) => n.ip),
    );
    const plan: AddressPlan = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      rows: addressRows(
        this.cameras,
        start,
        occupied,
        this.guard.ownAddresses(),
      ),
    };
    this.addressPlan = {
      plan: structuredClone(plan),
      epoch: this.guard.epoch,
      session: this.sessionGeneration,
      cameras: structuredClone(this.cameras),
    };
    return plan;
  }
  async applyAddresses(planId: string): Promise<AddressPlan> {
    const saved = this.addressPlan;
    this.addressPlan = undefined; // One review authorizes one execution only.
    if (
      !saved ||
      saved.plan.id !== planId ||
      Date.now() - Date.parse(saved.plan.createdAt) > 120000
    )
      throw Error("Plan d’adressage expiré. Vérifiez à nouveau la plage.");
    await this.guard.assert();
    this.guard.ensureEpoch(saved.epoch);
    if (saved.session !== this.sessionGeneration)
      throw Error("Session modifiée. Vérifiez à nouveau la plage.");
    const ready = saved.plan.rows.filter((r) => r.state === "ready");
    if (!ready.length) return saved.plan;
    if (
      !(await this.confirm(
        "Attribuer les adresses suivantes aux caméras identifiées ?\n\n" +
          ready
            .map(
              (r) =>
                `${r.name} · ${r.identity} : ${r.from} → ${r.to} (casier ${r.locker})`,
            )
            .join("\n") +
          "\n\nLes caméras en conflit sont exclues. Une coupure temporaire est attendue. Les adresses seront relues après chaque changement.",
      ))
    )
      throw Error("Opération annulée.");
    let stopped = false;
    for (const row of ready) {
      if (stopped) {
        row.state = "skipped";
        row.message =
          "Non envoyée : le changement précédent n’a pas été confirmé.";
        continue;
      }
      try {
        this.guard.ensureEpoch(saved.epoch);
        if (saved.session !== this.sessionGeneration)
          throw Error("Session modifiée.");
        const current = this.camera(row.id),
          before = saved.cameras.find((c) => c.id === row.id)!;
        if (
          current.ip !== row.from ||
          current.ambiguous ||
          !identityMatches(before, current)
        )
          throw Error("Identité ou adresse modifiée depuis la préparation.");
        const result = await this.changeIP(
          {
            id: row.id,
            address: row.to,
            mask: "255.255.255.0",
            isolated: false,
          },
          true,
        );
        row.state = result.verified ? "verified" : "failed";
        row.message = result.message;
        if (!result.verified) stopped = true;
      } catch (error) {
        row.state = "failed";
        row.message = this.log.safe(error);
        stopped = true;
      }
      this.log.add(
        row.state === "verified" ? "info" : "attention",
        "Adressage par casier",
        `Casier ${row.locker} : ${row.from} → ${row.to}. ${row.message}`,
        row.from,
      );
    }
    await this.profileJournal.backupVendor(
      {},
      "addressing-report",
      JSON.stringify(saved.plan),
    );
    return saved.plan;
  }
  async resolveIPConflict(id: string): Promise<Camera> {
    const selected = this.camera(id),
      a = await this.guard.assert(selected.ip);
    if (!this.credentials) throw Error("Connectez d’abord la session caméra.");
    if (!selected.endpoint)
      throw Error("Identité de découverte absente : relancez la détection.");
    const epoch = this.guard.epoch;
    // Two independent discoveries, plus authenticated identity and ARP checks.
    // The UI requires physical isolation; missed multicast replies alone do not
    // prove that another camera with the same address has been disconnected.
    for (let i = 0; i < 2; i++) {
      const found = await discoverOnInterface(
        a.address,
        a.mask,
        this.abort.signal,
      );
      this.guard.ensureEpoch(epoch);
      const peers = found.filter((c) => c.ip === selected.ip);
      if (peers.length !== 1 || peers[0].endpoint !== selected.endpoint)
        throw Error(
          "La caméra choisie n’est pas seule à cette IP, ou ne répond pas. Gardez uniquement cette caméra branchée puis réessayez.",
        );
    }
    const candidate = {
      ...selected,
      ambiguous: false,
      connectionError: undefined,
    };
    const conn = new CameraConnection(
      candidate,
      { ...this.credentials },
      this.guard,
      this.log,
      a.address,
    );
    try {
      await conn.connect();
      if (!candidate.mac) throw Error("Adresse MAC non vérifiable.");
      if (
        (selected.mac || selected.serial) &&
        !identityMatches(selected, candidate)
      )
        throw Error(
          "La caméra répondante ne correspond pas à l’identité choisie.",
        );
      const before = { ...candidate };
      for (let i = 0; i < 2; i++) {
        await this.guard.system.probe(candidate.ip, a.address);
        const peers = (await this.guard.system.neighbors(a.id)).filter(
          (n) => n.ip === candidate.ip,
        );
        if (peers.length !== 1 || peers[0].mac !== candidate.mac)
          throw Error("Identité Ethernet non confirmée.");
      }
      if (!identityMatches(before, await conn.identity()))
        throw Error("L’identité a changé pendant la vérification.");
      this.guard.ensureEpoch(epoch);
      for (const c of this.cameras) {
        this.connections.get(c.id)?.destroy();
        this.connections.delete(c.id);
        this.details.delete(c.id);
      }
      this.cameras = [selected];
      this.addressPlan = undefined;
      Object.assign(selected, candidate);
      conn.camera = selected;
      this.connections.set(id, conn);
      this.uncertain.delete(id);
      this.log.add(
        "info",
        "Conflit IP",
        "Caméra isolée et identité vérifiée. Attribuez une adresse unique avant de rebrancher les autres.",
        selected.ip,
      );
      return selected;
    } catch (error) {
      conn.destroy();
      throw error;
    }
  }
  private async setVendorDefaults(input: {
    id: string;
    group: VendorGroup;
    values: Record<string, any>;
    fingerprint: string;
  }): Promise<WriteResult> {
    const conn = await this.approve(
      input.id,
      "Appliquer les réglages du profil via l’API web.",
      false,
    );
    const spec = vendorGroups[input.group];
    if (!spec) throw Error("Groupe constructeur non autorisé.");
    const document = parseVendorDocument(await conn.vendorRequest(spec.read));
    const before = extractVendorGroup(document, input.group);
    if (vendorFingerprint(before) !== input.fingerprint)
      throw Error(
        "Configuration modifiée depuis la vérification. Relisez puis recommencez.",
      );
    const snapshot: VendorSnapshot = {
      groups: { [input.group]: { state: "available", data: before } },
      videoOptions: array(document.Video?.CodeList),
    };
    const change = buildVendorChange(snapshot, input.group, input.values);
    const backup = await this.profileJournal.backupVendor(
      { ip: conn.camera.ip, serial: conn.camera.serial, mac: conn.camera.mac },
      input.group,
      vendorBackup(input.group, before),
    );
    this.log.add(
      "info",
      "Sauvegarde API web",
      `Bloc ${input.group} · ${backup}`,
      conn.camera.ip,
    );
    let fields: Record<string, FieldVerification> = {};
    const result = await this.writeAndVerify(
      input.id,
      async () => {
        for (const request of vendorWrites(
          input.group,
          change.data,
          input.values,
        ))
          await conn.vendorRequest(request.endpoint, request.body);
      },
      async () => {
        const after = extractVendorGroup(
          parseVendorDocument(await conn.vendorRequest(spec.read)),
          input.group,
        );
        fields = Object.fromEntries(
          Object.entries(change.values).map(([id, desired]) => {
            try {
              const observed = vendorValue(after, id);
              return [id, { verified: observed === desired, observed }];
            } catch (e) {
              const message = this.log.safe(e);
              return [
                id,
                {
                  verified: false,
                  issues: [
                    { stage: "readback", code: "READBACK_FAILED", message },
                  ],
                },
              ];
            }
          }),
        );
        return Object.values(fields).every((field) => field.verified);
      },
    );
    return { ...result, fields };
  }
  async setDayMode(id: string, signal?: AbortSignal): Promise<WriteResult> {
    return this.applyDaylight(id, signal);
  }
  private async applyDaylight(
    id: string,
    signal?: AbortSignal,
  ): Promise<WriteResult> {
    signal?.throwIfAborted();
    let conn = await this.connection(id);
    const read = () =>
      signal
        ? conn.withReadSignal(signal, () => readDaylight(conn))
        : readDaylight(conn);
    let before = await read();
    const matching = (state: Awaited<ReturnType<typeof readDaylight>>) =>
      state.day;
    if (matching(before))
      return {
        sent: false,
        acknowledged: false,
        verified: true,
        message: "Mode jour déjà actif.",
      };
    conn = signal
      ? await conn.withReadSignal(signal, () =>
          this.approve(id, "Mode jour de la caméra.", false),
        )
      : await this.approve(id, "Mode jour de la caméra.", false);
    before = await read();
    const capture = structuredClone(before.capture);
    capture["@_IrcutMode"] = "3";
    await this.profileJournal.backupVendor(
      conn.camera,
      "capture",
      vendorBackup("capture", before.capture),
    );
    signal?.throwIfAborted();
    // Finish verification once a write is sent, even when the preview is replaced.
    let observed: Awaited<ReturnType<typeof readDaylight>> | undefined;
    const result = await this.writeAndVerify(
      id,
      async () => {
        if (vendorFingerprint(before.capture) !== vendorFingerprint(capture))
          await conn.vendorRequest(
            "/setMediaVideoCaptureConfig",
            vendorBody("capture", capture),
          );
        if (!before.day)
          await conn.vendorRequest("/setIRCutManual_DayNight", "DayMode");
      },
      async () => {
        observed = undefined;
        observed = await readDaylight(conn);
        return matching(observed);
      },
    );
    const message = observed
      ? `Mode manuel : ${observed.capture["@_IrcutMode"] === "3" ? "actif" : "inactif"} ; filtre IR : ${observed.filter} (ON attendu pour le jour).`
      : "État jour/nuit indisponible après la commande.";
    result.fields = {
      ircutMode: {
        verified: result.verified,
        observed: observed ? message : undefined,
        issues: result.verified
          ? []
          : observed
            ? [
                ...(result.issues || []).filter(
                  (i) => i.code !== "READBACK_MISMATCH",
                ),
                { stage: "readback", code: "READBACK_MISMATCH", message },
              ]
            : result.issues,
      },
    };
    if (!result.verified) result.message += " " + message;
    return result;
  }
  private async setPreviewLEDs(
    id: string,
    signal: AbortSignal,
  ): Promise<WriteResult> {
    let conn = await this.connection(id);
    const read = () =>
      conn.withReadSignal(signal, async () =>
        extractVendorGroup(
          parseVendorDocument(await conn.vendorRequest("/getMediaVideoConfig")),
          "capture",
        ),
      );
    const values = {
      lightMode: "Pure white light",
      lightBrightnessMode: "Manual",
      lightBrightness: 100,
    };
    let before = await read();
    if (!["0", "1", "2", "3"].includes(before["@_IrcutMode"]))
      throw Error(
        "Commande manuelle d’éclairage non disponible sur cette caméra.",
      );
    const matching = (data: any) =>
      data["@_IrcutMode"] === "3" &&
      Object.entries(values).every(
        ([key, value]) => vendorValue(data, key) === value,
      );
    if (matching(before))
      return {
        sent: false,
        acknowledged: false,
        verified: true,
        message:
          "Commande manuelle des LED et intensité 100 % déjà configurées ; allumage physique à contrôler sur l’image.",
      };
    conn = await conn.withReadSignal(signal, () =>
      this.approve(id, "Allumer les LED blanches.", false),
    );
    before = await read();
    const change = buildVendorChange(
      {
        groups: { capture: { state: "available", data: before } },
        videoOptions: [],
      },
      "capture",
      values,
    );
    // Passive/automatic IRCUT can keep the lights off despite a stored 100%
    // brightness. The device's own UI exposes mode 3 as manual control.
    // Never send NightMode to obtain illumination: the user wants colour/day.
    change.data["@_IrcutMode"] = "3";
    change.body = vendorBody("capture", change.data);
    await this.profileJournal.backupVendor(
      conn.camera,
      "capture",
      vendorBackup("capture", before),
    );
    signal.throwIfAborted();
    return this.writeAndVerify(
      id,
      () => conn.vendorRequest("/setMediaVideoCaptureConfig", change.body),
      async () =>
        matching(
          extractVendorGroup(
            parseVendorDocument(
              await conn.vendorRequest("/getMediaVideoConfig"),
            ),
            "capture",
          ),
        ),
    );
  }
  async preparePreviewLighting(
    id: string,
    signal: AbortSignal,
  ): Promise<string | undefined> {
    try {
      signal.throwIfAborted();
      const leds = await this.setPreviewLEDs(id, signal);
      if (!leds.verified)
        throw Error("LED blanches non confirmées par la caméra.");
      signal.throwIfAborted();
      this.log.add(
        "info",
        "Éclairage de l’aperçu",
        "Commande manuelle des LED blanches et intensité 100 % relues. L’allumage physique n’est pas mesuré par cette API.",
        this.camera(id).ip,
      );
    } catch (e) {
      signal.throwIfAborted();
      const warning = "Éclairage automatique : " + this.log.safe(e);
      this.log.add(
        "attention",
        "Éclairage de l’aperçu",
        warning,
        this.camera(id).ip,
      );
      return warning;
    }
  }
  async setWebOSD(v: Api["setWebOSD"]["input"]): Promise<WriteResult> {
    const conn = await this.approve(v.id, "Modifier l’affichage OSD.", false);
    const read = async () =>
      extractVendorGroup(
        parseVendorDocument(await conn.vendorRequest("/getMediaVideoConfig")),
        "overlay",
      );
    const before = await read();
    const data = changeWebOSD(before, v.values);
    await this.profileJournal.backupVendor(
      conn.camera,
      "overlay",
      vendorBackup("overlay", before),
    );
    return this.writeAndVerify(
      v.id,
      async () => {
        await conn.vendorRequest(
          "/setMediaVideoOverlayConfig",
          webOSDBody(data),
        );
        if (!v.values.enabled)
          for (const request of vendorWrites("overlay", data, {
            osd: false,
          }).slice(1))
            await conn.vendorRequest(request.endpoint, request.body);
      },
      async () =>
        JSON.stringify(readWebOSD(await read())) === JSON.stringify(v.values),
    );
  }
  async writeAndVerify(
    id: string,
    send: () => Promise<any>,
    verify: () => Promise<boolean>,
  ): Promise<WriteResult> {
    this.uncertain.add(id);
    const connection = this.connections.get(id);
    const writeCount = connection?.writeAttempts ?? 0;
    let acknowledged = false;
    const issues: OperationIssue[] = [];
    try {
      await send();
      acknowledged = true;
    } catch (e) {
      const message = this.log.safe(e);
      issues.push({ stage: "send", code: issueCode(message), message });
      this.log.add(
        "attention",
        "Écriture : résultat incertain",
        this.log.safe(e),
      );
    }
    let verified = false;
    let readError: unknown;
    // Firmware may acknowledge before committing. Retry only the readback:
    // a lost acknowledgement must never result in another write.
    for (const delay of [0, 400, 1000, 2000]) {
      if (connection?.closed) {
        readError = Error("Connexion interrompue avant la relecture.");
        break;
      }
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        verified = await verify();
        readError = undefined;
        if (verified) break;
      } catch (e) {
        readError = e;
        if (
          /authent|identit|réseau|interface|annul|interromp/i.test(
            this.log.safe(e),
          )
        )
          break;
      }
    }
    if (!verified) {
      if (!readError)
        issues.push({
          stage: "readback",
          code: "READBACK_MISMATCH",
          message: "La valeur relue ne correspond pas à la valeur demandée.",
        });
      else {
        const message = this.log.safe(readError);
        issues.push({
          stage: "readback",
          code: issueCode(message, "READBACK_FAILED"),
          message,
        });
      }
    }
    if (verified) this.uncertain.delete(id);
    this.log.add(
      verified ? "info" : "attention",
      "Résultat écriture",
      verified
        ? "Paramètres relus et vérifiés."
        : issues.map((i) => i.message).join(" · "),
      connection?.camera.ip,
    );
    return {
      issues,
      sent: (connection?.writeAttempts ?? 0) > writeCount,
      acknowledged,
      verified,
      message: verified
        ? "Paramètres relus et vérifiés."
        : "Configuration non vérifiée après plusieurs relectures. " +
          issues.map((i) => i.message).join(" · ") +
          " Reconnectez et relisez avant toute nouvelle écriture.",
    };
  }
  async disableOSD(v: Api["disableOSD"]["input"]): Promise<WriteResult> {
    const conn = await this.approve(
      v.id,
      "Supprimer les incrustations OSD de cette caméra.",
      false,
    );
    const before = await conn.osds();
    const chosen = v.tokens
      ? before.filter((o) => v.tokens!.includes(o.token))
      : before;
    if (v.tokens && chosen.length !== new Set(v.tokens).size)
      throw new Error(
        "Un objet OSD demandé a changé ou disparu. Relisez la caméra.",
      );
    if (!chosen.length)
      return {
        sent: false,
        acknowledged: false,
        verified: true,
        fields: { osd: { verified: true, observed: before.length > 0 } },
        message: "Aucune incrustation ONVIF présente.",
      };
    await this.osdStore.save(conn.camera, chosen);
    const count = conn.writeAttempts;
    let acknowledged = true;
    const results = [];
    const issues: OperationIssue[] = [];
    let observed: boolean | undefined;
    this.uncertain.add(v.id);
    for (const item of chosen) {
      try {
        await conn.call("deleteOSD", xmlEscape(item.token));
      } catch (e) {
        acknowledged = false;
        issues.push({
          stage: "send",
          code: issueCode(this.log.safe(e)),
          message: this.log.safe(e),
        });
        this.log.add(
          "attention",
          "Suppression OSD interrompue",
          `${conn.camera.ip} · ${this.log.safe(e)}`,
        );
        break;
      }
    }
    let verified = false;
    try {
      const after = await conn.osds();
      observed = after.length > 0;
      for (const item of chosen)
        results.push({
          parameter: `OSD ${item.token}`,
          verified: !after.some((o) => o.token === item.token),
          message: after.some((o) => o.token === item.token)
            ? "Toujours présent"
            : "Absence vérifiée par GetOSDs",
        });
      const untouched = before.filter(
        (o) => !chosen.some((x) => x.token === o.token),
      );
      verified =
        results.every((r) => r.verified) &&
        untouched.every((o) =>
          after.some((x) => x.token === o.token && x.signature === o.signature),
        ) &&
        (v.tokens !== undefined || after.length === 0);
      if (!verified)
        issues.push({
          stage: "readback",
          code: "READBACK_MISMATCH",
          message:
            "Les objets OSD relus ne correspondent pas au résultat attendu.",
        });
    } catch (e) {
      issues.push({
        stage: "readback",
        code: issueCode(this.log.safe(e), "READBACK_FAILED"),
        message: this.log.safe(e),
      });
      results.push({
        parameter: "Relecture OSD",
        verified: false,
        message: this.log.safe(e),
      });
    }
    if (verified) this.uncertain.delete(v.id);
    this.log.add(
      verified ? "info" : "attention",
      "Désactivation OSD",
      `${conn.camera.ip} · ${verified ? "Suppression vérifiée" : "Résultat partiel ou incertain"}`,
    );
    return {
      sent: conn.writeAttempts > count,
      acknowledged,
      verified,
      results,
      issues,
      fields: {
        osd: { verified, ...(observed === undefined ? {} : { observed }) },
      },
      message: verified
        ? "Incrustations supprimées dans la caméra et absence vérifiée. Sauvegarde locale disponible pour restauration."
        : "Suppression partielle ou non vérifiée. Sauvegarde conservée ; relisez avant de poursuivre.",
    };
  }
  async restoreOSD(id: string): Promise<WriteResult> {
    const conn = await this.approve(
      id,
      "Restaurer les objets OSD sauvegardés.",
      false,
    );
    const saved = await this.osdStore.read(conn.camera);
    if (!saved)
      throw new Error("Aucune sauvegarde OSD correspondant à cette identité.");
    const before = await conn.osds();
    const remaining = [...before];
    const missing = saved.objects.filter((o) => {
      const i = remaining.findIndex((x) => x.signature === o.signature);
      if (i < 0) return true;
      remaining.splice(i, 1);
      return false;
    });
    if (
      missing.some((o) =>
        before.some((x) => x.token === o.token && x.signature !== o.signature),
      )
    )
      throw new Error(
        "Un OSD existant a été modifié depuis la sauvegarde. Restauration automatique refusée pour éviter un doublon.",
      );
    if (!missing.length) {
      await this.osdStore.save(conn.camera, before, true);
      return {
        sent: false,
        acknowledged: false,
        verified: true,
        message: "Les objets sauvegardés sont déjà présents.",
        fields: { osd: { verified: true, observed: before.length > 0 } },
      };
    }
    let restored: Awaited<ReturnType<CameraConnection["osds"]>> = [];
    let observed: boolean | undefined;
    const result = await this.writeAndVerify(
      id,
      async () => {
        for (const item of missing)
          await conn.soap(
            "CreateOSD",
            osdPayload(item, conn.mediaNamespace, true),
          );
      },
      async () => {
        const after = await conn.osds();
        restored = after;
        observed = after.length > 0;
        const pool = [...after];
        return (
          saved.objects.every((o) => {
            const i = pool.findIndex((x) => x.signature === o.signature);
            if (i < 0) return false;
            pool.splice(i, 1);
            return true;
          }) &&
          before.every((o) =>
            after.some(
              (x) => x.token === o.token && x.signature === o.signature,
            ),
          )
        );
      },
    );
    // CreateOSD assigns fresh tokens: rebase only after successful readback.
    if (result.verified) await this.osdStore.save(conn.camera, restored, true);
    result.fields = {
      osd: {
        verified: result.verified,
        ...(observed === undefined ? {} : { observed }),
      },
    };
    return result;
  }
  async createOSD(v: Api["createOSD"]["input"]): Promise<WriteResult> {
    const conn = await this.connection(v.id);
    if (
      !array(conn.cam.profiles).some(
        (p) => token(p.videoSourceConfiguration) === v.source,
      )
    )
      throw new Error("Source vidéo OSD inconnue.");
    const { id: _id, source, ...rawValues } = v;
    const values = Object.fromEntries(
      Object.entries(rawValues).filter(([, value]) => value !== undefined),
    );
    const options = await conn.osdOptions(source);
    validateOSD(values, options, true);
    await this.approve(
      v.id,
      "Activer une nouvelle incrustation OSD sur la caméra.",
      false,
    );
    const before = await conn.osds();
    const existing = before.filter((o) => o.source === source);
    const kind = values.textType === "Plain" ? "PlainText" : values.textType!;
    if (
      options.maximum.Total === undefined ||
      existing.length >= options.maximum.Total ||
      (options.maximum[kind] !== undefined &&
        existing.filter((o) => o.textType === values.textType).length >=
          options.maximum[kind])
    )
      throw new Error(
        "Nombre maximal d’incrustations OSD atteint ou non communiqué par la caméra.",
      );
    const payload = newOSDPayload(source, values, conn.mediaNamespace);
    let createdToken = "";
    return this.writeAndVerify(
      v.id,
      async () => {
        const xml = await conn.soap("CreateOSD", payload);
        createdToken =
          textOf(parseXML(xml), "OSDToken") || textOf(parseXML(xml), "Token");
      },
      async () => {
        const after = await conn.osds();
        const created = after.filter(
          (o) =>
            !before.some((b) => b.token === o.token) &&
            (!createdToken || o.token === createdToken),
        );
        return (
          created.length === 1 &&
          created[0].source === source &&
          created[0].type === "Text" &&
          Object.entries(values).every(
            ([key, value]) =>
              created[0][key as keyof (typeof created)[0]] === value,
          ) &&
          before.every((o) =>
            after.some(
              (x) => x.token === o.token && x.signature === o.signature,
            ),
          )
        );
      },
    );
  }
  async editOSD(v: Api["setOSD"]["input"]): Promise<WriteResult> {
    const conn = await this.approve(
      v.id,
      "Modifier les paramètres OSD.",
      false,
    );
    const before = await conn.osds();
    const item = before.find((o) => o.token === v.token);
    if (!item) throw new Error("Objet OSD absent. Relisez la caméra.");
    const { id: _id, token: _token, ...rawChanges } = v;
    const changes = Object.fromEntries(
      Object.entries(rawChanges).filter(([, value]) => value !== undefined),
    );
    if (
      Object.entries(changes).every(
        ([key, value]) => item[key as keyof typeof item] === value,
      )
    )
      return {
        sent: false,
        acknowledged: false,
        verified: true,
        message: "OSD inchangé.",
      };
    if (Object.keys(changes).some((k) => k !== "text"))
      validateOSD(changes, await conn.osdOptions(item.source));
    if (
      (changes.x !== undefined || changes.y !== undefined) &&
      (changes.position ?? item.position) !== "Custom"
    )
      throw new Error(
        "Les coordonnées nécessitent une position personnalisée.",
      );
    const payload = osdPayload(item, conn.mediaNamespace, false, changes);
    await this.osdStore.save(conn.camera, [item]);
    return this.writeAndVerify(
      v.id,
      () => conn.soap("SetOSD", payload),
      async () => {
        const after = await conn.osds();
        return (
          after.some(
            (o) => o.token === item.token && o.signature === signature(payload),
          ) &&
          before
            .filter((o) => o.token !== item.token)
            .every((o) =>
              after.some(
                (x) => x.token === o.token && x.signature === o.signature,
              ),
            )
        );
      },
    );
  }
  async setCameraNetwork(
    v: Api["setCameraNetwork"]["input"],
  ): Promise<WriteResult> {
    let conn = await this.writeGuard(v.id);
    // A network edit must not wait for unrelated video/image/OSD capabilities.
    const initial = {
      network: { data: await conn.call("getNetworkInterfaces") },
      gateway: await conn.feature(() => conn.call("getNetworkDefaultGateway")),
      dns: await conn.feature(() => conn.call("getDNS")),
    };
    const nic = matchInterface(array(initial.network.data), conn.camera.ip);
    const current =
      array(nic.IPv4?.config?.manual).find(
        (x) => x.address === conn.camera.ip,
      ) ?? nic.IPv4?.config?.fromDHCP;
    const staticChange =
      v.dhcp !== true &&
      ((v.address !== undefined && v.address !== conn.camera.ip) ||
        (v.mask !== undefined && prefix(v.mask) !== current?.prefixLength) ||
        (v.dhcp === false && nic.IPv4?.config?.DHCP !== false));
    const dhcpChange = v.dhcp === true && nic.IPv4?.config?.DHCP !== true;
    if (staticChange) {
      if (!v.address || !v.mask)
        throw new Error("Adresse et masque requis pour l’adressage statique.");
      const a = await this.guard.assert(conn.camera.ip);
      cameraAddress(
        v.address,
        v.mask,
        a.address,
        a.mask,
        this.guard.ownAddresses(),
      );
    }
    if (v.gateway) {
      if (
        !v.mask &&
        (!Number.isInteger(current?.prefixLength) ||
          current.prefixLength < 1 ||
          current.prefixLength > 30)
      )
        throw new Error(
          "Masque caméra non disponible pour vérifier la passerelle.",
        );
      const gatewayMask =
        v.mask ??
        [24, 16, 8, 0]
          .map(
            (n) =>
              ((0xffffffff << (32 - Number(current?.prefixLength))) >>> n) &
              255,
          )
          .join(".");
      host(v.gateway, gatewayMask);
      if (!sameSubnet(v.address ?? conn.camera.ip, v.gateway, gatewayMask))
        throw new Error(
          "La passerelle doit appartenir au sous-réseau de la caméra.",
        );
    }
    const oldGateways = array(initial.gateway.data?.IPv4Address).map(String);
    const gatewayChange =
      v.gateway !== undefined &&
      JSON.stringify(oldGateways) !==
        JSON.stringify(v.gateway ? [v.gateway] : []);
    const oldDNS = initial.dns.data;
    const dnsChange =
      v.dns !== undefined &&
      (oldDNS?.fromDHCP !== false ||
        JSON.stringify(
          array(oldDNS?.DNSManual)
            .map((x) => x.IPv4Address)
            .filter(Boolean),
        ) !== JSON.stringify(v.dns));
    if (gatewayChange && initial.gateway.state !== "available")
      throw new Error("Passerelle non lisible : modification indisponible.");
    if (dnsChange && initial.dns.state !== "available")
      throw new Error("DNS non lisibles : modification indisponible.");
    if (array(initial.gateway.data?.IPv6Address).length > 1 && gatewayChange)
      throw new Error(
        "Plusieurs passerelles IPv6 : utilisez l’interface web pour conserver cette configuration.",
      );
    if (array(oldDNS?.searchDomain).length > 1 && dnsChange)
      throw new Error(
        "Plusieurs domaines DNS : utilisez l’interface web pour conserver cette configuration.",
      );
    if (!staticChange && !dhcpChange && !gatewayChange && !dnsChange)
      return {
        sent: false,
        acknowledged: false,
        verified: true,
        message: "Configuration réseau inchangée.",
      };
    conn = await this.approve(
      v.id,
      `Modifier le réseau de cette caméra :\n${JSON.stringify({ dhcp: v.dhcp, address: v.address, mask: v.mask, gateway: v.gateway, dns: v.dns })}\nUne coupure de connexion est possible.`,
      true,
    );
    const freshNIC = matchInterface(
      array(await conn.call("getNetworkInterfaces")),
      conn.camera.ip,
    );
    if (JSON.stringify(freshNIC) !== JSON.stringify(nic))
      throw new Error(
        "La configuration a changé pendant la confirmation. Relisez avant d’appliquer.",
      );
    const results: NonNullable<WriteResult["results"]> = [];
    let sent = false,
      acknowledged = true;
    const record = (parameter: string, r: WriteResult) => {
      results.push({ parameter, verified: r.verified, message: r.message });
      sent ||= r.sent;
      acknowledged &&= r.acknowledged;
      return r.verified;
    };
    if (dnsChange) {
      const latest = await conn.call("getDNS");
      if (JSON.stringify(latest) !== JSON.stringify(oldDNS))
        throw new Error("Les DNS ont changé pendant la confirmation.");
      const next = {
        fromDHCP: false,
        searchDomain: oldDNS.searchDomain,
        DNSManual: [
          ...v.dns!.map((IPv4Address) => ({ type: "IPv4", IPv4Address })),
          ...array(oldDNS.DNSManual).filter((x) => x.type === "IPv6"),
        ],
      };
      if (
        !record(
          "DNS",
          await this.writeAndVerify(
            v.id,
            () => conn.call("setDNS", escapeTree(next)),
            async () => {
              const read = await conn.call("getDNS");
              return (
                read.fromDHCP === false &&
                JSON.stringify(
                  array(read.DNSManual)
                    .map((x) => x.IPv4Address)
                    .filter(Boolean),
                ) === JSON.stringify(v.dns)
              );
            },
          ),
        )
      )
        return {
          sent,
          acknowledged,
          verified: false,
          results,
          message:
            "DNS non vérifiés. Les autres modifications n’ont pas été envoyées.",
        };
    }
    if (gatewayChange) {
      const latestGateway = await conn.call("getNetworkDefaultGateway");
      if (
        JSON.stringify(latestGateway) !== JSON.stringify(initial.gateway.data)
      )
        throw new Error("La passerelle a changé pendant la confirmation.");
      const r = await this.writeAndVerify(
        v.id,
        () =>
          conn.call("setNetworkDefaultGateway", {
            IPv4Address: v.gateway,
            IPv6Address: array(initial.gateway.data?.IPv6Address)[0],
          }),
        async () =>
          JSON.stringify(
            array(
              (await conn.call("getNetworkDefaultGateway")).IPv4Address,
            ).map(String),
          ) === JSON.stringify(v.gateway ? [v.gateway] : []),
      );
      if (!record("Passerelle", r))
        return {
          sent,
          acknowledged,
          verified: false,
          results,
          message: "Passerelle non vérifiée. L’adressage n’a pas été modifié.",
        };
    }
    if (staticChange)
      record(
        "Adresse / masque / DHCP",
        await this.changeIP(
          {
            id: v.id,
            address: v.address!,
            mask: v.mask!,
            isolated: v.isolated,
          },
          true,
        ),
      );
    if (dhcpChange)
      record("DHCP", await this.enableCameraDHCP(v.id, conn, nic));
    return {
      sent,
      acknowledged,
      verified: results.every((r) => r.verified),
      results,
      camera: this.camera(v.id),
      message: results.every((r) => r.verified)
        ? "Modifications réseau relues et vérifiées."
        : "Une modification réseau reste à vérifier.",
    };
  }
  async enableCameraDHCP(
    id: string,
    conn: CameraConnection,
    nic: any,
  ): Promise<WriteResult> {
    const old = { ...conn.camera },
      credentials = conn.credentials,
      count = conn.writeAttempts;
    let acknowledged = false;
    this.uncertain.add(id);
    await this.video.stop();
    try {
      await conn.setIPv4(token(nic), true);
      acknowledged = true;
    } catch (e) {
      this.log.add("attention", "DHCP caméra", this.log.safe(e));
    }
    conn.destroy();
    this.connections.delete(id);
    const sent = conn.writeAttempts > count;
    if (sent)
      try {
        const result = await reconnect(
          async () => {
            const a = await this.guard.assert();
            const found = await discoverOnInterface(
              a.address,
              a.mask,
              this.abort.signal,
              1500,
            );
            const candidates = old.endpoint
              ? found.filter((c) => c.endpoint === old.endpoint)
              : [];
            const ips = [...new Set([...candidates.map((c) => c.ip), old.ip])];
            for (const ip of ips) {
              try {
                await this.guard.assert(ip);
              } catch {
                continue;
              }
              const candidate = { ...old, ip };
              const fresh = new CameraConnection(
                candidate,
                credentials,
                this.guard,
                this.log,
                a.address,
              );
              try {
                await fresh.connect();
                const ni = matchInterface(
                  array(await fresh.call("getNetworkInterfaces")),
                  ip,
                );
                if (
                  !identityMatches(old, candidate) ||
                  ni.IPv4?.config?.DHCP !== true
                )
                  throw new Error("Identité ou DHCP non confirmé.");
                return { fresh, candidate };
              } catch {
                fresh.destroy();
              }
            }
            throw new Error(
              "Adresse DHCP non retrouvée. Vérifiez le serveur DHCP ou recherchez à nouveau la caméra.",
            );
          },
          () => true,
          2,
          1000,
        );
        Object.assign(this.camera(id), result.candidate);
        this.connections.set(id, result.fresh);
        this.uncertain.delete(id);
        return {
          sent,
          acknowledged,
          verified: true,
          camera: this.camera(id),
          message: "Nouvelle adresse et DHCP vérifiés sur la même caméra.",
        };
      } catch {}
    return {
      sent,
      acknowledged,
      verified: false,
      message:
        "DHCP demandé ; nouvelle adresse non vérifiée. Un serveur DHCP est nécessaire. Relancez la détection puis reconnectez la caméra.",
    };
  }
  async diagnose(id: string): Promise<DiagnosticReport> {
    const c = this.camera(id);
    const report: DiagnosticReport = {
      cameraId: id,
      ip: c.ip,
      at: new Date().toISOString(),
      checks: [],
    };
    const add = (
      key: string,
      label: string,
      state: DiagnosticReport["checks"][number]["state"],
      detail: string,
    ) => {
      const check = { key, label, state, detail };
      const index = report.checks.findIndex((x) => x.key === key);
      if (index < 0) report.checks.push(check);
      else report.checks[index] = check;
    };
    try {
      const a = await this.guard.assert(c.ip);
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect({
          host: c.ip,
          port: c.port,
          localAddress: a.address,
        });
        socket.setTimeout(3000);
        socket.once("connect", () => {
          socket.destroy();
          resolve();
        });
        socket.once("error", reject);
        socket.once("timeout", () => {
          socket.destroy();
          reject(new Error("Délai de connexion dépassé."));
        });
      });
      add(
        "network",
        "Accessibilité réseau",
        "passed",
        `Connexion TCP au port ONVIF ${c.port} depuis ${a.address}.`,
      );
    } catch (e) {
      add("network", "Accessibilité réseau", "failed", this.log.safe(e));
    }
    const conn = this.connections.get(id);
    if (!conn || conn.closed) {
      for (const [key, label] of [
        ["onvif", "Service ONVIF"],
        ["auth", "Authentification"],
        ["identity", "Informations appareil"],
        ["video", "Flux vidéo"],
        ["encoding", "Résolution et FPS"],
        ["ip", "Configuration réseau"],
        ["osd", "Configuration OSD"],
        ["firmware", "Firmware"],
      ])
        add(
          key,
          label,
          "untested",
          "Connectez la caméra avec ses identifiants pour effectuer ce test.",
        );
    } else {
      try {
        await conn.identity();
        add(
          "onvif",
          "Service ONVIF",
          "passed",
          "GetDeviceInformation a répondu.",
        );
        add(
          "auth",
          "Authentification",
          "passed",
          "Lecture acceptée avec la session courante ; certains appareils autorisent aussi la lecture anonyme.",
        );
        add(
          "identity",
          "Informations appareil",
          c.serial || c.mac ? "passed" : "untested",
          `${c.model || "Modèle non fourni"} · série ${c.serial || "non fournie"} · MAC ${c.mac || "non fournie"}`,
        );
        const detail = await conn.detail();
        this.details.set(id, detail);
        const checkFeature = (
          key: string,
          label: string,
          f: any,
          success: string,
        ) =>
          add(
            key,
            label,
            f.state === "available"
              ? "passed"
              : f.state === "unsupported"
                ? "unsupported"
                : f.state === "error"
                  ? "failed"
                  : "untested",
            f.state === "available" ? success : f.message || "Non testé",
          );
        checkFeature(
          "ip",
          "Configuration réseau",
          detail.network,
          JSON.stringify(detail.network.data),
        );
        checkFeature(
          "osd",
          "Configuration OSD",
          detail.osd,
          `${detail.osd.data?.settings?.length ?? 0} objet(s) lu(s). Lecture vérifiée ; aucune écriture effectuée par le diagnostic.`,
        );
        checkFeature(
          "encoding",
          "Résolution et FPS",
          detail.video.state === "available" && !array(detail.video.data).length
            ? {
                state: "unverified",
                message: "Aucune configuration vidéo exploitable reçue.",
              }
            : detail.video,
          array(detail.video.data)
            .map(
              (x) =>
                `${x.name || x.profile} : ${x.config.resolution?.width} × ${x.config.resolution?.height}, ${x.config.rateControl?.frameRateLimit ?? "FPS non fourni"} FPS · ${x.config.encoding}`,
            )
            .join(" ; "),
        );
        add(
          "firmware",
          "Firmware",
          c.firmware ? "passed" : "untested",
          c.firmware || "Version non fournie par l’appareil.",
        );
        const profile = token(detail.profiles[0]);
        if (profile) {
          try {
            const stream = await this.video.start(await conn.stream(profile));
            await new Promise<void>((resolve, reject) => {
              const ws = new WebSocket(stream.url);
              const timer = setTimeout(() => {
                ws.terminate();
                reject(new Error("Aucune donnée vidéo reçue en 10 secondes."));
              }, 10000);
              const finish = (err?: Error) => {
                clearTimeout(timer);
                ws.terminate();
                err ? reject(err) : resolve();
              };
              ws.on("message", (_d, binary) => {
                if (binary) finish();
              });
              ws.once("error", finish);
              ws.once("close", () =>
                finish(new Error("Flux fermé avant réception des données.")),
              );
            });
            add(
              "video",
              "Flux vidéo",
              "passed",
              "Données média reçues par le relais RTSP. Le décodage visuel n’a pas été mesuré.",
            );
          } catch (e) {
            add("video", "Flux vidéo", "failed", this.log.safe(e));
          } finally {
            await this.video.stop();
          }
        } else
          add("video", "Flux vidéo", "untested", "Aucun profil exploitable.");
      } catch (e) {
        add("onvif", "Service ONVIF", "failed", this.log.safe(e));
        if (!report.checks.some((x) => x.key === "auth"))
          add(
            "auth",
            "Authentification",
            /401|403|unauthor|not.?authorized|authent/i.test(this.log.safe(e))
              ? "failed"
              : "untested",
            this.log.safe(e),
          );
        for (const [key, label] of [
          ["identity", "Informations appareil"],
          ["video", "Flux vidéo"],
          ["encoding", "Résolution et FPS"],
          ["ip", "Configuration réseau"],
          ["osd", "Configuration OSD"],
          ["firmware", "Firmware"],
        ])
          if (!report.checks.some((x) => x.key === key))
            add(key, label, "untested", "Lecture interrompue.");
      }
    }
    try {
      await this.conflict(c);
      add(
        "conflicts",
        "Conflits d’adresse détectables",
        "passed",
        "Aucune contradiction observée via découverte et ARP. Cela ne prouve pas l’absence d’un équipement silencieux.",
      );
    } catch (e) {
      add(
        "conflicts",
        "Conflits d’adresse détectables",
        "failed",
        this.log.safe(e),
      );
    }
    this.reports = [
      ...this.reports.filter((r) => r.cameraId !== id),
      report,
    ].slice(-256);
    for (const check of report.checks)
      this.log.add(
        check.state === "failed" ? "erreur" : "info",
        check.label,
        `${c.ip} · ${check.detail}`,
        c.ip,
      );
    return report;
  }

  async dispatch<K extends keyof Api>(
    method: K,
    input: Api[K]["input"],
  ): Promise<Api[K]["output"]> {
    const v: any = schemas[method].parse(input);
    let out: any;
    switch (method) {
      case "previewFactoryReset":
        await this.guard.assert();
        out = await this.factoryReset.preview(
          v.ids.map((id: string) => ({ ...this.camera(id) })),
        );
        break;
      case "applyFactoryReset":
        await this.stopVideo();
        await this.cancelCameraRead();
        await this.finishPreviewLighting();
        out = await this.factoryReset.apply(v.planId, v.confirmation);
        break;
      case "syncCameraTime": {
        const conn = await this.approve(
          v.id,
          "Synchroniser la date et l’heure avec le Mac",
          false,
        );
        const originalClock = await conn.soap("GetSystemDateAndTime", "", true);
        parseCameraClock(originalClock);
        await this.profileJournal.backupVendor(
          conn.camera,
          "clock",
          originalClock,
        );
        let settings = clockSettings(v.timezone);
        let compatibility = false;
        let fields: Record<string, FieldVerification> | undefined;
        out = await this.writeAndVerify(
          v.id,
          async () => {
            try {
              await conn.soap(
                "SetSystemDateAndTime",
                cameraClockPayload(settings),
                true,
              );
              const got = parseCameraClock(
                await conn.soap("GetSystemDateAndTime", "", true),
              );
              conn.cam.timeShift = got.at - process.uptime() * 1000;
              // A second, different configuration is allowed only after an
              // acknowledged write and a precise, confirmed DST error. Never
              // retry writes after timeout or an unavailable readback.
              if (hasDSTClockError(got, settings)) {
                settings = fixedClockSettings(v.timezone);
                compatibility = true;
                await conn.soap(
                  "SetSystemDateAndTime",
                  cameraClockPayload(settings),
                  true,
                );
                this.log.add(
                  "attention",
                  "Compatibilité de l’horloge",
                  "La caméra gère incorrectement l’heure d’été. Décalage local actuel appliqué ; resynchroniser au changement été/hiver.",
                  conn.camera.ip,
                );
              }
            } finally {
              conn.cam.timeShift = Date.now() - process.uptime() * 1000;
            }
          },
          async () => {
            const got = parseCameraClock(
              await conn.soap("GetSystemDateAndTime", "", true),
            );
            conn.cam.timeShift = got.at - process.uptime() * 1000;
            fields = {
              syncTime: {
                verified:
                  Math.abs(got.at - Date.now()) <= 10000 &&
                  got.mode === "Manual" &&
                  (got.localAt === undefined
                    ? !compatibility
                    : localClockMatches(got, v.timezone)),
                observed: new Date(got.at).toISOString(),
              },
              clockTimezone: {
                verified: clockTimezoneMatches(got, settings),
                observed: compatibility
                  ? `${got.timezone} · compatibilité : décalage actuel, resynchronisation nécessaire au changement été/hiver`
                  : got.timezone,
              },
            };
            return Object.values(fields).every((f) => f.verified);
          },
        );
        out.fields = fields;
        if (compatibility && out.verified)
          out.message +=
            " Compatibilité horloge : resynchronisez au changement été/hiver.";
        break;
      }
      case "auditDefaults":
        await this.stopVideo();
        out = await this.defaults.audit(v.ids);
        break;
      case "listDefaultsRuns":
        out = await this.profileJournal.list();
        break;
      case "getDefaultsRun":
        out = await this.profileJournal.get(v.id);
        break;
      case "exportDefaultsRun":
        if (!this.exportProfileRun) throw Error("Export indisponible.");
        out = await this.exportProfileRun(await this.profileJournal.get(v.id));
        break;
      case "getDefaults":
        out = await this.defaults.store.read();
        break;
      case "saveDefaults":
        out = await this.defaults.store.save(v);
        break;
      case "previewDefaults":
        await this.stopVideo();
        out = await this.defaults.preview(v.ids);
        break;
      case "applyDefaults":
        await this.stopVideo();
        out = await this.defaults.apply(v.planId);
        break;
      case "state":
        out = {
          platform: process.platform,
          arch: process.arch,
          network: await this.guard.refresh(),
          cameras: this.cameras,
          logs: this.log.entries,
          videoReady: await this.video.available(),
          reports: this.reports,
          session: this.session(),
        };
        break;
      case "previewAddresses":
        out = await this.previewAddresses(v.start);
        break;
      case "applyAddresses":
        out = await this.applyAddresses(v.planId);
        break;
      case "resolveIPConflict":
        out = await this.resolveIPConflict(v.id);
        break;
      case "discover":
        out = await this.discovery();
        break;
      case "addCamera": {
        const a = await this.guard.assert(v.ip);

        out = this.cameras.find((c) => c.ip === v.ip && c.port === v.port);
        if (!out) {
          out = {
            id: randomUUID(),
            ip: v.ip,
            port: v.port,
            path: "/onvif/device_service",
            status: "Ajout manuel · non authentifiée",
            ambiguous: false,
          };
          this.cameras.push(out);
        }
        await this.connectPending();
        break;
      }
      case "connectSession": {
        await this.guard.assert();
        await this.disconnectSession();
        this.credentials = { username: v.username, password: v.password };
        this.log.secrets.add(v.password);
        this.log.secrets.add(encodeURIComponent(v.password));
        if (!this.cameras.length) await this.discovery();
        else await this.connectPending();
        out = this.session();
        break;
      }
      case "disconnectSession":
        await this.disconnectSession();
        break;
      case "retryConnections":
        await this.guard.assert();
        if (!this.credentials)
          throw new Error("Ouvrez d’abord une session dans l’application.");
        await this.connectPending(true);
        out = this.session();
        break;
      case "selectCamera":
        out = await this.selectDetail(v.id, false, v.requestId);
        break;
      case "readCamera": {
        out = await this.selectDetail(v.id, true, v.requestId);
        break;
      }
      case "cancelCameraRead":
        await this.cancelCameraRead();
        break;
      case "changeIP":
        out = await this.changeIP(v);
        break;
      case "setVideo": {
        let conn = await this.connection(v.id);
        const entry = await conn.videoEntry(v.token);
        validateVideo(entry, v);
        const current = entry.config;
        if (
          current.resolution?.width === v.width &&
          current.resolution?.height === v.height &&
          current.rateControl?.frameRateLimit === v.fps &&
          (v.codec === undefined || current.encoding === v.codec) &&
          (v.h264Profile === undefined ||
            (current.H264?.H264Profile ?? current.$?.Profile) ===
              v.h264Profile) &&
          (v.quality === undefined || current.quality === v.quality) &&
          (v.bitrate === undefined ||
            current.rateControl?.bitrateLimit === v.bitrate) &&
          (v.govLength === undefined ||
            (current[current.encoding]?.govLength ?? current.$?.GovLength) ===
              v.govLength) &&
          (v.constantBitrate === undefined ||
            current.rateControl?.$?.ConstantBitRate === v.constantBitrate)
        ) {
          out = {
            sent: false,
            acknowledged: false,
            verified: true,
            message: "Paramètres vidéo inchangés.",
          };
          break;
        }
        const originalXML = await conn.encoderXML(v.token);
        const payload = encoderPayload(
          originalXML,
          v.token,
          conn.mediaNamespace,
          v,
          entry,
        );
        conn = await this.approve(
          v.id,
          `Modifier le profil vidéo ${v.token}\nAvant : ${JSON.stringify(entry.config.resolution)}, ${entry.config.rateControl?.frameRateLimit} FPS\nAprès : ${v.width} × ${v.height}, ${v.fps} FPS${v.quality !== undefined ? " · qualité " + v.quality : ""}${v.bitrate !== undefined ? " · débit " + v.bitrate + " kb/s" : ""}\nEncodage demandé : ${v.codec ?? entry.config.encoding}. Les profils partageant cet encodeur sont concernés.`,
          false,
        );
        await this.video.stop();
        if (
          encoderFingerprint(await conn.encoderXML(v.token), v.token) !==
          encoderFingerprint(originalXML, v.token)
        )
          throw new Error(
            "La configuration vidéo a changé pendant la lecture. Relisez puis recommencez.",
          );
        let fields: Record<string, FieldVerification> | undefined;
        out = await this.writeAndVerify(
          v.id,
          () =>
            conn.soap(
              "SetVideoEncoderConfiguration",
              payload +
                (conn.cam.media2Support
                  ? ""
                  : "<sz:ForcePersistence>true</sz:ForcePersistence>"),
            ),
          async () => {
            const got = array(await conn.call("getProfiles"))
              .map((p) => p.videoEncoderConfiguration)
              .find((c) => token(c) === v.token);
            this.details.delete(v.id);
            if (!got) throw Error("Encodeur absent de la relecture vidéo.");
            fields = videoReadback(v, got);
            return Object.values(fields).every((f) => f.verified);
          },
        );
        out.fields = fields;
        break;
      }
      case "setImage": {
        let conn = await this.connection(v.id);
        const detail = await conn.detail();
        if (detail.image.state !== "available" || !Object.keys(v.values).length)
          throw new Error("Options d’image non vérifiées.");
        const source =
          detail.image.data.sourceToken ?? conn.cam.activeSource?.sourceToken;
        if (!source) throw Error("Source d’image absente ou ambiguë.");
        const options = detail.image.data.options;
        for (const [key, value] of Object.entries(v.values)) {
          if (key === "irCutFilter") {
            if (!array(options.irCutFilterModes).includes(value))
              throw new Error("Mode infrarouge non disponible.");
          } else inRange(value as number, options[key], key);
        }
        conn = await this.approve(
          v.id,
          `Modifier l’image\nAvant : ${JSON.stringify(detail.image.data.settings)}\nValeurs demandées : ${JSON.stringify(v.values)}\nLe filtre infrarouge n’est pas une commande de LED.`,
          false,
        );
        const values = Object.fromEntries(
          Object.entries(v.values).map(([k, x]) => [k, String(x)]),
        );
        const latestImage = await conn.call("getImagingSettings", {
          token: xmlEscape(source),
        });
        if (
          Object.keys(v.values).some(
            (k) =>
              String(latestImage[k]) !== String(detail.image.data.settings[k]),
          )
        )
          throw new Error(
            "Les réglages d’image ont changé pendant la confirmation. Relisez puis recommencez.",
          );
        let fields: Record<string, FieldVerification> | undefined;
        out = await this.writeAndVerify(
          v.id,
          () =>
            conn.call("setImagingSettings", {
              token: xmlEscape(source),
              ...values,
            }),
          async () => {
            const got = await conn.call("getImagingSettings", {
              token: xmlEscape(source),
            });
            fields = compareFields(v.values, got);
            return Object.values(fields).every((f) => f.verified);
          },
        );
        out.fields = fields;
        break;
      }
      case "setWebOSD":
        out = await this.setWebOSD(v);
        break;
      case "createOSD":
        out = await this.createOSD(v);
        break;
      case "setOSD":
        out = await this.editOSD(v);
        break;
      case "disableOSD":
        out = await this.disableOSD(v);
        break;
      case "restoreOSD":
        out = await this.restoreOSD(v.id);
        break;
      case "diagnose":
        out = await this.diagnose(v.id);
        break;
      case "setCameraNetwork":
        out = await this.setCameraNetwork(v);
        break;
      case "previewProfiles": {
        const conn = await this.connection(v.id);
        out = array(conn.cam.profiles);
        break;
      }
      case "startVideo": {
        const stopping = this.stopVideo();
        const controller = new AbortController();
        this.videoRequest = controller;
        await stopping;
        controller.signal.throwIfAborted();
        const conn = await this.connection(v.id);
        const uri = await conn.withReadSignal(controller.signal, () =>
          conn.stream(v.profile),
        );
        controller.signal.throwIfAborted();
        out = await this.video.start(uri);
        controller.signal.throwIfAborted();
        const url = out.url;
        // Display video immediately; lighting never holds up navigation or decoding.
        const preparation = this.previewLighting
          .catch(() => {})
          .then(() => this.preparePreviewLighting(v.id, controller.signal));
        this.previewLighting = preparation;
        void preparation
          .then((warning) => {
            if (!controller.signal.aborted)
              this.onPreviewLighting({ id: v.id, url, warning });
          })
          .catch(() => {});
        break;
      }
      case "stopVideo":
        await this.stopVideo();
        break;
      case "openWeb": {
        const c = this.camera(v.id);
        await this.guard.assert(c.ip);
        await this.open(`http://${c.ip}/`);
        break;
      }
      case "exportLogs":
        out = await this.exportFile();
        break;
    }
    return out;
  }
  shutdown() {
    return this.disconnectSession();
  }
}
