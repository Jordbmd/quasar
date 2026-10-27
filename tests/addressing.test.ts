import { expect, it, vi } from "vitest";
import { addressRows } from "../src/main/addressing";
import { CameraService, schemas } from "../src/main/service";
import { Diagnostics } from "../src/main/diagnostics";
import type { Camera } from "../src/shared/types";

const camera = (n: number): Camera => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  ip: `192.168.1.${n}`,
  port: 80,
  path: "/onvif/device_service",
  status: "Connectée",
  ambiguous: false,
  serial: `serial-${n}`,
  mac: `02:00:00:00:00:${n.toString(16).padStart(2, "0")}`,
});
it("attribue casier +10 dans l’ordre des IP et ne modifie pas la liste source", () => {
  const cameras = [camera(18), camera(16), camera(17)];
  const rows = addressRows(cameras, 1, new Set(), ["192.168.1.2"]);
  expect(rows.map((r) => [r.from, r.to, r.locker])).toEqual([
    ["192.168.1.16", "192.168.1.11", 1],
    ["192.168.1.17", "192.168.1.12", 2],
    ["192.168.1.18", "192.168.1.13", 3],
  ]);
  expect(cameras[0].ip).toBe("192.168.1.18");
  expect(() => addressRows(cameras, 244, new Set(), [])).toThrow("244");
});
it("exclut les doublons, les destinations occupées et les adresses du Mac", () => {
  const c = camera(16),
    duplicate = { ...camera(19), ip: c.ip };
  const rows = addressRows(
    [c, duplicate, camera(18), camera(20)],
    1,
    new Set(["192.168.1.13"]),
    ["192.168.1.14"],
  );
  expect(rows.every((r) => r.state === "blocked")).toBe(true);
  const swapped = addressRows(
    [camera(12), camera(13)],
    2,
    new Set(["192.168.1.12"]),
    [],
  );
  expect(swapped.every((r) => r.state === "unchanged")).toBe(true);
  const disconnected = camera(19);
  disconnected.connectionError = "timeout";
  expect(addressRows([disconnected], 1, new Set(), [])[0].state).toBe(
    "blocked",
  );
});
function fixture() {
  const cameras = [camera(16), camera(17)];
  const service: any = Object.create(CameraService.prototype);
  const guard = {
    epoch: 0,
    assert: vi.fn(async () => ({})),
    ensureEpoch: (n: number) => {
      if (n !== guard.epoch) throw Error("Interface modifiée");
    },
  };
  const plan = {
    id: "00000000-0000-4000-8000-000000000099",
    createdAt: new Date().toISOString(),
    rows: addressRows(cameras, 1, new Set(), []),
  };
  Object.assign(service, {
    guard,
    cameras,
    sessionGeneration: 1,
    addressPlan: {
      plan,
      epoch: 0,
      session: 1,
      cameras: structuredClone(cameras),
    },
    confirm: vi.fn(async () => true),
    log: new Diagnostics(),
    profileJournal: { backupVendor: vi.fn(async () => {}) },
    changeIP: vi.fn(async () => ({ verified: true, message: "Relu" })),
  });
  return { service, guard, plan };
}
it("applique le plan séquentiellement, exige une confirmation et empêche sa réutilisation", async () => {
  const { service, plan } = fixture();
  const result = await service.applyAddresses(plan.id);
  expect(result.rows.every((r: any) => r.state === "verified")).toBe(true);
  expect(service.confirm).toHaveBeenCalledOnce();
  expect(service.changeIP.mock.calls.map((x: any) => x[0].address)).toEqual([
    "192.168.1.11",
    "192.168.1.12",
  ]);
  await expect(service.applyAddresses(plan.id)).rejects.toThrow("expiré");
});
it("arrête le lot après un résultat incertain et ne touche pas les caméras suivantes", async () => {
  const { service, plan } = fixture();
  service.changeIP.mockResolvedValue({
    verified: false,
    message: "Délai dépassé",
  });
  const result = await service.applyAddresses(plan.id);
  expect(result.rows.map((r: any) => r.state)).toEqual(["failed", "skipped"]);
  expect(service.changeIP).toHaveBeenCalledOnce();
});
it("refuse une confirmation annulée, un plan périmé et un réseau changé", async () => {
  const a = fixture();
  a.service.confirm.mockResolvedValue(false);
  await expect(a.service.applyAddresses(a.plan.id)).rejects.toThrow("annulée");
  expect(a.service.changeIP).not.toHaveBeenCalled();
  const b = fixture();
  b.plan.createdAt = new Date(Date.now() - 121000).toISOString();
  await expect(b.service.applyAddresses(b.plan.id)).rejects.toThrow("expiré");
  const c = fixture();
  c.service.confirm = async () => {
    c.guard.epoch++;
    return true;
  };
  const result = await c.service.applyAddresses(c.plan.id);
  expect(result.rows[0].state).toBe("failed");
  expect(c.service.changeIP).not.toHaveBeenCalled();
});
it("refuse une identité qui change après la revue et une fausse attestation d’isolation", async () => {
  const f = fixture();
  f.service.cameras[0].mac = "02:00:00:00:00:ff";
  expect((await f.service.applyAddresses(f.plan.id)).rows[0].state).toBe(
    "failed",
  );
  expect(f.service.changeIP).not.toHaveBeenCalled();
  expect(() =>
    schemas.resolveIPConflict.parse({ id: camera(16).id, isolated: false }),
  ).toThrow();
});
it("publie la progression sans annoncer une adresse vérifiée avant sa relecture", async () => {
  const { service, plan } = fixture();
  const updates: any[] = [];
  service.onAddressProgress = (update: unknown) =>
    updates.push(structuredClone(update));
  let finish!: (result: { verified: boolean; message: string }) => void;
  service.changeIP.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const applying = service.applyAddresses(plan.id);
  await vi.waitFor(() => expect(service.changeIP).toHaveBeenCalledOnce());
  expect(updates).toEqual([
    {
      planId: plan.id,
      camera: "192.168.1.16 → 192.168.1.11",
      completed: 0,
      total: 2,
      stage: "Attribution et relecture de l’adresse",
    },
  ]);
  finish({ verified: false, message: "Relecture incertaine" });
  await applying;
  expect(updates.map((p) => p.completed)).toEqual([0, 1, 2, 2]);
  expect(updates.some((p) => p.stage === "Adresse vérifiée")).toBe(false);
  expect(updates[2].stage).toContain("Non exécutée");
  expect(service.changeIP).toHaveBeenCalledOnce();
});
