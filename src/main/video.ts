import { spawn, ChildProcess } from "node:child_process";
import net from "node:net";
import http from "node:http";
import { Transform, TransformCallback } from "node:stream";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, unlink, access } from "node:fs/promises";
import path from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { NetworkGuard } from "./network";
import { Diagnostics } from "./diagnostics";
import { abortable } from "./cancellation";

// RTSP redirects would let go2rtc open a new socket outside the source-bound
// proxy. Inspect framed control responses and reject redirects before forwarding.
export class RTSPResponseGuard extends Transform {
  private pending: Buffer = Buffer.alloc(0);
  _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ) {
    try {
      this.pending = Buffer.concat([this.pending, chunk]);
      while (this.pending.length) {
        let size: number;
        if (this.pending[0] === 0x24) {
          if (this.pending.length < 4) break;
          size = 4 + this.pending.readUInt16BE(2);
        } else {
          const end = this.pending.indexOf("\r\n\r\n");
          if (end < 0) {
            if (this.pending.length > 65536)
              throw new Error("En-tête RTSP trop volumineux.");
            break;
          }
          const header = this.pending.subarray(0, end).toString("ascii");
          if (
            !/^RTSP\/1\.0 \d{3}/.test(header) ||
            /^RTSP\/1\.0 30[12]/.test(header)
          )
            throw new Error("Réponse ou redirection RTSP non autorisée.");
          const length = Number(
            header.match(/^Content-Length:\s*(\d+)/im)?.[1] ?? 0,
          );
          if (length > 2 * 1024 * 1024)
            throw new Error("Réponse RTSP trop volumineuse.");
          size = end + 4 + length;
        }
        if (this.pending.length < size) break;
        this.push(this.pending.subarray(0, size));
        this.pending = this.pending.subarray(size);
      }
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }
}
async function port() {
  const server = net.createServer();
  await new Promise<void>((r, j) => {
    server.once("error", j);
    server.listen(0, "127.0.0.1", r);
  });
  const n = (server.address() as net.AddressInfo).port;
  await new Promise<void>((r) => server.close(() => r()));
  return n;
}
export class VideoRelay {
  child?: ChildProcess;
  proxy?: net.Server;
  web?: http.Server;
  ws?: WebSocketServer;
  sockets = new Set<net.Socket>();
  upstream = new Set<WebSocket>();
  config?: string;
  activeIp?: string;
  private generation = 0;
  private lifecycle: Promise<unknown> = Promise.resolve();
  private preparation?: AbortController;
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.lifecycle.then(work, work);
    this.lifecycle = result.catch(() => {});
    return result;
  }
  constructor(
    private root: string,
    private guard: NetworkGuard,
    private log: Diagnostics,
    private temporary = path.join(root, ".runtime"),
  ) {}
  async available() {
    try {
      await access(
        path.join(
          this.root,
          "bin",
          process.platform === "win32" ? "go2rtc.exe" : "go2rtc",
        ),
      );
      return true;
    } catch {
      return false;
    }
  }
  get revision() {
    return this.generation;
  }
  start(uriText: string) {
    this.preparation?.abort(new Error("Aperçu interrompu."));
    const controller = new AbortController();
    this.preparation = controller;
    const generation = ++this.generation;
    return this.enqueue(async () => {
      if (generation !== this.generation) throw new Error("Aperçu interrompu.");
      await this.closeResources();
      return this.open(uriText, generation, controller.signal);
    });
  }
  private async open(uriText: string, generation: number, signal: AbortSignal) {
    const ensureActive = () => {
      if (generation !== this.generation) throw new Error("Aperçu interrompu.");
    };
    ensureActive();
    const uri = new URL(uriText);
    const a = await abortable(this.guard.assert(uri.hostname), signal);
    const epoch = this.guard.epoch;
    if (!(await this.available()))
      throw new Error("go2rtc absent. Lancez npm run setup:video.");
    ensureActive();
    const ip = uri.hostname;
    const targetPort = Number(uri.port || 554);
    this.activeIp = ip;
    try {
      this.proxy = net.createServer((socket) => {
        this.sockets.add(socket);
        socket.on("error", () => {});
        socket.on("close", () => this.sockets.delete(socket));
        this.guard
          .assert(ip)
          .then(() => {
            ensureActive();
            this.guard.ensureEpoch(epoch);
            const remote = net.connect({
              host: ip,
              port: targetPort,
              localAddress: a.address,
              timeout: 7000,
            });
            this.sockets.add(remote);
            remote.on("error", () => socket.destroy());
            remote.on("timeout", () => {
              remote.destroy();
              socket.destroy();
            });
            remote.on("close", () => {
              this.sockets.delete(remote);
              socket.destroy();
            });
            socket.on("close", () => remote.destroy());
            remote.once("connect", () => remote.setTimeout(30000));
            socket.pipe(remote);
            const responseGuard = new RTSPResponseGuard();
            responseGuard.on("error", () => {
              remote.destroy();
              socket.destroy();
            });
            remote.pipe(responseGuard).pipe(socket);
          })
          .catch(() => socket.destroy());
      });
      await new Promise<void>((r, j) => {
        this.proxy!.once("error", j);
        this.proxy!.listen(0, "127.0.0.1", r);
      });
      const proxyPort = (this.proxy.address() as net.AddressInfo).port;
      const apiPort = await port();
      const secret = randomBytes(24).toString("hex");
      const base = `http://127.0.0.1:${apiPort}/${secret}`;
      // No camera credentials or URI in config, arguments or logs.
      const config = JSON.stringify({
        api: { listen: `127.0.0.1:${apiPort}`, base_path: `/${secret}` },
        rtsp: { listen: "" },
        webrtc: { listen: "", ice_servers: [] },
        srt: { listen: "" },
        rtmp: { listen: "" },
        log: { level: "fatal" },
        streams: {},
      });
      await mkdir(this.temporary, {
        recursive: true,
        mode: 0o700,
      });
      this.config = path.join(this.temporary, `go2rtc-${secret}.json`);
      await writeFile(this.config, config, { mode: 0o600 });
      this.child = spawn(
        process.execPath,
        [
          path.join(this.root, "scripts/video-supervisor.cjs"),
          path.join(
            this.root,
            "bin",
            process.platform === "win32" ? "go2rtc.exe" : "go2rtc",
          ),
          this.config,
        ],
        {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          stdio: ["pipe", "ignore", "ignore"],
          windowsHide: true,
        },
      );
      let exited = false;
      this.child.on("error", () => {
        exited = true;
      });
      this.child.on("exit", () => {
        exited = true;
        this.log.add("info", "Relais vidéo arrêté");
      });
      let ready = false;
      for (let i = 0; i < 40; i++) {
        ensureActive();
        if (exited)
          throw new Error("Le relais vidéo s’est arrêté au démarrage.");
        try {
          const r = await fetch(base + "/api/streams", {
            signal: AbortSignal.any([signal, AbortSignal.timeout(300)]),
          });
          if (r.ok) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!ready) throw new Error("Relais vidéo local indisponible.");
      ensureActive();
      this.guard.ensureEpoch(epoch);
      uri.hostname = "127.0.0.1";
      uri.port = String(proxyPort);
      uri.hash = "transport=tcp#backchannel=0#timeout=10";
      const result = await fetch(
        base +
          "/api/streams?" +
          new URLSearchParams({ name: "preview", src: uri.toString() }),
        {
          method: "PATCH",
          signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
        },
      );
      if (!result.ok) throw new Error("Le relais a refusé le flux.");
      const viewKey = randomBytes(24).toString("hex");
      this.web = http.createServer((_, res) => {
        res.writeHead(404);
        res.end();
      });
      this.ws = new WebSocketServer({ noServer: true, maxPayload: 1024 });
      this.web.on("upgrade", (req, socket, head) => {
        if (req.url !== `/video/${viewKey}`) {
          socket.destroy();
          return;
        }
        this.ws!.handleUpgrade(req, socket, head, (client) => {
          let retryTimer: NodeJS.Timeout | undefined;
          let attempt = 0;
          let active: WebSocket | undefined;
          const connect = () => {
            if (
              generation !== this.generation ||
              client.readyState !== WebSocket.OPEN
            )
              return;
            let initialized = false,
              retrying = false;
            const up = new WebSocket(
              base.replace("http:", "ws:") + "/api/ws?src=preview",
              { origin: base },
            );
            active = up;
            this.upstream.add(up);
            up.on("open", () =>
              up.send(
                JSON.stringify({
                  type: "mse",
                  value:
                    "avc1.640029,avc1.64002A,avc1.640033,hvc1.1.6.L153.B0,mp4a.40.2,mp4a.40.5,opus",
                }),
              ),
            );
            up.on("message", (data, binary) => {
              if (!binary) {
                try {
                  const message = JSON.parse(data.toString());
                  if (message.type === "mse") initialized = true;
                  if (message.type === "error") {
                    this.log.add(
                      "attention",
                      "Lecture RTSP",
                      message.value,
                      ip,
                    );
                    // Retry one interrupted handshake, never rejected credentials
                    // or a stream whose decoder has already received its init data.
                    if (
                      !initialized &&
                      attempt++ === 0 &&
                      /timeout|ECONNRESET|EOF/i.test(String(message.value))
                    ) {
                      retrying = true;
                      up.close();
                      retryTimer = setTimeout(connect, 250);
                      return;
                    }
                  }
                } catch {}
              }
              if (binary) initialized = true;
              if (client.readyState === WebSocket.OPEN) {
                if (client.bufferedAmount > 8 * 1024 * 1024) {
                  client.close();
                  up.close();
                } else client.send(data, { binary });
              }
            });
            up.on("error", () => {
              if (!retrying) client.close();
            });
            up.on("close", () => {
              this.upstream.delete(up);
              if (!retrying) client.close();
            });
          };
          client.on("error", () => active?.close());
          client.on("close", () => {
            clearTimeout(retryTimer);
            active?.close();
          });
          connect();
        });
      });
      await new Promise<void>((r, j) => {
        this.web!.once("error", j);
        this.web!.listen(0, "127.0.0.1", r);
      });
      ensureActive();
      this.guard.ensureEpoch(epoch);
      return {
        url: `ws://127.0.0.1:${(this.web.address() as net.AddressInfo).port}/video/${viewKey}`,
      };
    } catch (e) {
      await this.closeResources();
      throw e;
    }
  }
  stop() {
    this.preparation?.abort(new Error("Aperçu interrompu."));
    this.preparation = undefined;
    this.generation++;
    return this.enqueue(() => this.closeResources());
  }
  private async closeResources() {
    const config = this.config;
    this.config = undefined;
    this.activeIp = undefined;
    for (const w of this.upstream) w.terminate();
    this.upstream.clear();
    for (const w of this.ws?.clients ?? []) w.terminate();
    this.ws?.close();
    this.ws = undefined;
    this.web?.close();
    this.web = undefined;
    // Closing the consumer makes go2rtc send RTSP TEARDOWN. Keep its TCP
    // proxy alive briefly so the camera can release the previous session.
    if (this.sockets.size) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 300);
        const sockets = [...this.sockets];
        let remaining = sockets.length;
        for (const socket of sockets)
          socket.once("close", () => {
            if (--remaining === 0) {
              clearTimeout(timer);
              resolve();
            }
          });
      });
    }
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
    this.proxy?.close();
    this.proxy = undefined;
    const child = this.child;
    this.child = undefined;
    if (child) {
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          resolve();
        }, 2200);
        child.stdin?.end();
      });
    }
    if (config) await unlink(config).catch(() => {});
  }
}
