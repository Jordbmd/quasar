// Real relay process, loopback only. No camera or multicast discovery.
import { it, expect, vi } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { tmpdir } from "node:os";
import { VideoRelay } from "../src/main/video";
import { Diagnostics } from "../src/main/diagnostics";
import type { NetworkGuard } from "../src/main/network";

it("signale un relais absent sans ouvrir de proxy", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quasar-missing-"));
  const guard = {
    assert: async () => ({ address: "127.0.0.1" }),
    epoch: 1,
  } as unknown as NetworkGuard;
  const relay = new VideoRelay(root, guard, new Diagnostics());
  try {
    await expect(relay.start("rtsp://127.0.0.1/fixture")).rejects.toThrow(
      "go2rtc absent",
    );
    expect(relay.child).toBeUndefined();
    expect(relay.proxy).toBeUndefined();
  } finally {
    await relay.stop();
    await rm(root, { recursive: true, force: true });
  }
});

it("ferme le vrai relais à la fermeture du pipe parent, avec chemins Unicode et espaces", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quasar vidéo "));
  const reserved = net.createServer();
  await new Promise<void>((resolve, reject) => {
    reserved.once("error", reject);
    reserved.listen(0, "127.0.0.1", resolve);
  });
  const port = (reserved.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => reserved.close(() => resolve()));
  const config = path.join(root, "configuration privée.json");
  await writeFile(
    config,
    JSON.stringify({
      api: { listen: `127.0.0.1:${port}` },
      rtsp: { listen: "" },
      webrtc: { listen: "" },
      srt: { listen: "" },
      rtmp: { listen: "" },
      streams: {},
    }),
  );
  const child = spawn(
    process.execPath,
    [
      path.resolve("scripts/video-supervisor.cjs"),
      path.resolve(
        "bin",
        process.platform === "win32" ? "go2rtc.exe" : "go2rtc",
      ),
      config,
    ],
    { stdio: ["pipe", "ignore", "ignore"], windowsHide: true },
  );
  const ended = once(child, "exit");
  try {
    await vi.waitFor(
      async () => {
        expect(child.exitCode).toBeNull();
        const r = await fetch(`http://127.0.0.1:${port}/api/streams`, {
          signal: AbortSignal.timeout(300),
        });
        expect(r.ok).toBe(true);
      },
      { timeout: 4000 },
    );
    child.stdin.end();
    await ended;
    // A released listening socket verifies that the child relay, not merely
    // the supervisor, has stopped. No process lookup or unrelated PID killing.
    const check = net.createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        check.once("error", reject);
        check.listen(port, "127.0.0.1", resolve);
      });
    } finally {
      await new Promise<void>((resolve) => check.close(() => resolve()));
    }
  } finally {
    child.stdin.end();
    if (child.exitCode === null) child.kill("SIGTERM");
    await ended;
    await rm(root, { recursive: true, force: true });
  }
});

it("nettoie les ressources si le port du proxy est occupé, sans démarrer le relais", async () => {
  const guard = {
    assert: async () => ({ address: "127.0.0.1" }),
    epoch: 1,
  } as unknown as NetworkGuard;
  const relay = new VideoRelay("/unused", guard, new Diagnostics());
  relay.available = async () => true;
  // Inject the OS bind failure deterministically: no race to steal a real port.
  const listening = vi
    .spyOn(net.Server.prototype, "listen")
    .mockImplementationOnce(function (this: net.Server) {
      queueMicrotask(() =>
        this.emit(
          "error",
          Object.assign(new Error("Port occupé"), { code: "EADDRINUSE" }),
        ),
      );
      return this;
    });
  try {
    await expect(relay.start("rtsp://127.0.0.1/fixture")).rejects.toMatchObject(
      { code: "EADDRINUSE" },
    );
    expect(relay.child).toBeUndefined();
    expect(relay.proxy).toBeUndefined();
    expect(relay.web).toBeUndefined();
  } finally {
    listening.mockRestore();
    await relay.stop();
  }
});

it("signale un superviseur indisponible et ferme le proxy après l’échec de démarrage", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quasar-relay-error-"));
  const guard = {
    assert: async () => ({ address: "127.0.0.1" }),
    epoch: 1,
  } as unknown as NetworkGuard;
  const relay = new VideoRelay(root, guard, new Diagnostics());
  relay.available = async () => true;
  try {
    await expect(relay.start("rtsp://127.0.0.1/fixture")).rejects.toThrow(
      /arrêté au démarrage/,
    );
    expect(relay.child).toBeUndefined();
    expect(relay.proxy).toBeUndefined();
    expect(relay.config).toBeUndefined();
  } finally {
    await relay.stop();
    await rm(root, { recursive: true, force: true });
  }
});
