// Test-only camera data. The only real socket is bound to loopback.
import { it, expect, vi } from "vitest";
import net from "node:net";
import { CameraService } from "../src/main/service";
import { Diagnostics } from "../src/main/diagnostics";
async function fixture() {
  const server = net.createServer((s) => s.end());
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const guard: any = {
    assert: async () => ({ address: "127.0.0.1" }),
    onSuspend: () => {},
  };
  const service = new CameraService(
    guard,
    new Diagnostics(),
    { stop: vi.fn() } as any,
    async () => true,
    async () => {},
    async () => "",
    {} as any,
  );
  const c = {
    id: "test",
    ip: "127.0.0.1",
    port: (server.address() as any).port,
    path: "/device",
    status: "TEST",
    ambiguous: false,
  };
  service.cameras = [c];
  service.conflict = vi.fn(async () => {});
  return {
    service,
    c,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
it("mesure le TCP mais laisse les contrôles non authentifiés non testés", async () => {
  const f = await fixture();
  try {
    const r = await f.service.diagnose(f.c.id);
    expect(r.checks.find((x) => x.key === "network")?.state).toBe("passed");
    expect(r.checks.find((x) => x.key === "auth")?.state).toBe("untested");
    expect(r.checks.find((x) => x.key === "video")?.state).toBe("untested");
    expect(r.checks).toHaveLength(10);
  } finally {
    await f.close();
  }
});
it("distingue erreur, absence de support et absence de mesure", async () => {
  const f = await fixture();
  try {
    f.service.connections.set(f.c.id, {
      identity: async () => {},
      detail: async () => ({
        network: { state: "error", message: "Lecture refusée" },
        video: { state: "available", data: [] },
        osd: { state: "unsupported", message: "ActionNotSupported" },
        profiles: [],
      }),
    } as any);
    const r = await f.service.diagnose(f.c.id);
    expect(r.checks.find((x) => x.key === "ip")?.state).toBe("failed");
    expect(r.checks.find((x) => x.key === "osd")?.state).toBe("unsupported");
    expect(r.checks.find((x) => x.key === "encoding")?.state).toBe("untested");
    expect(r.checks.find((x) => x.key === "video")?.state).toBe("untested");
    expect(r.checks.find((x) => x.key === "firmware")?.state).toBe("untested");
  } finally {
    await f.close();
  }
});
it("identifie une authentification refusée et ne duplique pas les tests", async () => {
  const f = await fixture();
  try {
    f.service.connections.set(f.c.id, {
      identity: async () => {
        throw Error("401 Unauthorized");
      },
    } as any);
    const r = await f.service.diagnose(f.c.id);
    expect(r.checks.find((x) => x.key === "auth")?.state).toBe("failed");
    expect(new Set(r.checks.map((x) => x.key)).size).toBe(r.checks.length);
  } finally {
    await f.close();
  }
});
