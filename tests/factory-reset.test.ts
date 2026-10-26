import { expect, it, vi } from "vitest";
import { FactoryReset } from "../src/main/factory-reset";
import { schemas } from "../src/main/service";
import type { Camera } from "../src/shared/types";
const camera = (n: number): Camera => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  ip: `192.168.1.${n}`,
  port: 80,
  path: "/onvif/device_service",
  status: "Connectée",
  ambiguous: false,
  serial: `CAM-${n}`,
  mac: `02:00:00:00:00:${n.toString(16).padStart(2, "0")}`,
});
function fixture(cameras = [camera(20), camera(9)]) {
  let context = "network:session";
  const hooks = {
    context: () => context,
    read: vi.fn(async (id: string) =>
      structuredClone(cameras.find((c) => c.id === id)!),
    ),
    check: vi.fn(async (_c: Camera) => {}),
    send: vi.fn(async (_id: string) => {}),
    confirm: vi.fn(async (_text: string) => true),
    save: vi.fn(async (_plan: any) => {}),
    finish: vi.fn(async () => {}),
    safe: (e: unknown) => (e instanceof Error ? e.message : String(e)),
    progress: vi.fn(),
  };
  return {
    reset: new FactoryReset(hooks),
    hooks,
    cameras,
    change: () => {
      context += ":changed";
    },
  };
}
it("prépare sans écrire, trie numériquement et fige les cibles examinées", async () => {
  const f = fixture();
  const plan = await f.reset.preview(f.cameras);
  expect(plan.rows.map((r) => r.camera.ip)).toEqual([
    "192.168.1.9",
    "192.168.1.20",
  ]);
  expect(f.hooks.send).not.toHaveBeenCalled();
  plan.rows[0].camera.id = "forged";
  const result = await f.reset.apply(plan.id, "EFFACER");
  expect(f.hooks.send.mock.calls.flat()).toEqual([camera(9).id, camera(20).id]);
  expect(result.rows.every((r) => r.state === "accepted")).toBe(true);
  expect(result.rows[0].message).toContain("à contrôler");
  expect(f.hooks.finish).toHaveBeenCalledOnce();
  await expect(f.reset.apply(plan.id, "EFFACER")).rejects.toThrow("expirée");
  expect(f.hooks.send).toHaveBeenCalledTimes(2);
});
it("exclut les IP dupliquées et les identités non vérifiées", async () => {
  const cameras = [
    camera(11),
    { ...camera(12), ip: camera(11).ip },
    camera(13),
  ];
  const f = fixture(cameras);
  f.hooks.read.mockResolvedValue({ ...camera(13), serial: "OTHER" });
  const plan = await f.reset.preview(cameras);
  expect(plan.rows.every((r) => r.state === "blocked")).toBe(true);
  await expect(f.reset.apply(plan.id, "EFFACER")).rejects.toThrow("Aucune");
  expect(f.hooks.send).not.toHaveBeenCalled();
});
it("exige la phrase exacte et la confirmation finale, sans réutilisation après annulation", async () => {
  const f = fixture();
  const plan = await f.reset.preview(f.cameras);
  await expect(f.reset.apply(plan.id, "oui")).rejects.toThrow("EFFACER");
  f.hooks.confirm.mockResolvedValue(false);
  await expect(f.reset.apply(plan.id, "EFFACER")).rejects.toThrow("annulée");
  await expect(f.reset.apply(plan.id, "EFFACER")).rejects.toThrow("expirée");
  expect(f.hooks.send).not.toHaveBeenCalled();
  expect(
    schemas.applyFactoryReset.safeParse({
      planId: plan.id,
      confirmation: "oui",
    }).success,
  ).toBe(false);
  expect(
    schemas.previewFactoryReset.safeParse({
      ids: [camera(11).id, camera(11).id],
    }).success,
  ).toBe(false);
});
it("refuse un réseau modifié pendant la confirmation et un plan expiré", async () => {
  const f = fixture();
  const plan = await f.reset.preview(f.cameras);
  f.hooks.confirm.mockImplementation(async () => {
    f.change();
    return true;
  });
  await expect(f.reset.apply(plan.id, "EFFACER")).rejects.toThrow("contexte");
  expect(f.hooks.send).not.toHaveBeenCalled();
  const g = fixture();
  const p = await g.reset.preview(g.cameras);
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 121000);
  try {
    await expect(g.reset.apply(p.id, "EFFACER")).rejects.toThrow("expirée");
  } finally {
    now.mockRestore();
  }
  expect(g.hooks.send).not.toHaveBeenCalled();
});
it("ne réessaie jamais un reset après perte de réponse et arrête le lot", async () => {
  const f = fixture();
  const p = await f.reset.preview(f.cameras);
  f.hooks.send.mockRejectedValueOnce(Error("ECONNRESET"));
  const result = await f.reset.apply(p.id, "EFFACER");
  expect(result.rows.map((r) => r.state)).toEqual(["uncertain", "skipped"]);
  expect(f.hooks.send).toHaveBeenCalledOnce();
  expect(f.hooks.finish).toHaveBeenCalledOnce();
  expect(f.hooks.save.mock.calls.at(-1)?.[0].phase).toBe("complete");
});
it("contrôle de nouveau chaque identité avant envoi et ne continue pas sur un conflit", async () => {
  const f = fixture();
  const p = await f.reset.preview(f.cameras);
  f.hooks.check.mockRejectedValueOnce(Error("Identité modifiée"));
  const r = await f.reset.apply(p.id, "EFFACER");
  expect(r.rows.map((r) => r.state)).toEqual(["failed", "skipped"]);
  expect(f.hooks.send).not.toHaveBeenCalled();
  expect(f.hooks.finish).not.toHaveBeenCalled();
});
it("n’envoie aucune commande sans journal durable et s’arrête si le journal échoue ensuite", async () => {
  const f = fixture();
  const p = await f.reset.preview(f.cameras);
  f.hooks.save.mockRejectedValue(Error("disque plein"));
  await expect(f.reset.apply(p.id, "EFFACER")).rejects.toThrow("disque plein");
  expect(f.hooks.send).not.toHaveBeenCalled();
  const g = fixture();
  const q = await g.reset.preview(g.cameras);
  g.hooks.save
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValue(Error("disque plein"));
  const r = await g.reset.apply(q.id, "EFFACER");
  expect(g.hooks.send).toHaveBeenCalledOnce();
  expect(r.rows.map((r) => r.state)).toEqual(["accepted", "skipped"]);
  expect(r.warning).toContain("disque plein");
});

it("branche le reset complet au service et ferme les sessions sans reconnexion automatique", async () => {
  const { CameraService } = await import("../src/main/service");
  const { Diagnostics } = await import("../src/main/diagnostics");
  const target = camera(11);
  const service = new CameraService(
    { epoch: 1, assert: async () => ({}), onSuspend: () => {} } as any,
    new Diagnostics(),
    { stop: async () => {} } as any,
    async () => true,
    async () => {},
    async () => "",
    {} as any,
  );
  const credentials = { username: "test-only", password: "simulation-only" };
  (service as any).credentials = credentials;
  const conn: any = {
    camera: target,
    credentials,
    cam: {},
    closed: false,
    destroy: vi.fn(() => {
      conn.closed = true;
    }),
    soap: vi.fn(async () => "<SetSystemFactoryDefaultResponse/>"),
  };
  service.cameras = [target];
  service.connections.set(target.id, conn);
  vi.spyOn(service, "writeGuard").mockResolvedValue(conn);
  vi.spyOn(service, "approve").mockResolvedValue(conn);
  const progress = vi.fn();
  service.onFactoryResetProgress = progress;
  const plan = await service.dispatch("previewFactoryReset", {
    ids: [target.id],
  });
  expect(conn.soap).not.toHaveBeenCalled();
  const result = await service.dispatch("applyFactoryReset", {
    planId: plan.id,
    confirmation: "EFFACER",
  });
  expect(result.rows[0].state).toBe("accepted");
  expect(conn.soap).toHaveBeenCalledExactlyOnceWith(
    "SetSystemFactoryDefault",
    "<sz:FactoryDefault>Hard</sz:FactoryDefault>",
    true,
  );
  expect(service.connections.size).toBe(0);
  expect(service.cameras).toEqual([]);
  expect(service.session().active).toBe(false);
  expect(credentials.password).toBe("");
  expect(progress.mock.calls.at(-1)?.[0].phase).toBe("complete");
});
