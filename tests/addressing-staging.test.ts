import { expect, it, vi } from "vitest";
import { addressSchedule } from "../src/main/addressing";
import { CameraService } from "../src/main/service";
import { Diagnostics } from "../src/main/diagnostics";
import type { Camera } from "../src/shared/types";
import type { AddressPlan, LockerAssignment } from "../src/shared/addressing";

const camera = (id: number, ip = id): Camera => ({
  id: String(id),
  ip: `192.168.1.${ip}`,
  port: 80,
  path: "/onvif/device_service",
  status: "Connectée",
  mac: `02:00:00:00:00:${id.toString(16).padStart(2, "0")}`,
  endpoint: `urn:camera-${id}`,
  serial: `serial-${id}`,
  ambiguous: false,
});
const scratch = ["192.168.1.254", "192.168.1.253", "192.168.1.252"];
function schedule(
  cameras: Camera[],
  assignments?: LockerAssignment[],
  occupied = new Set<string>(),
  targets = new Set(cameras.map((c) => c.id)),
) {
  return addressSchedule(
    cameras,
    1,
    occupied,
    ["192.168.1.2"],
    targets,
    scratch,
    assignments,
  );
}
function assertSafe(cameras: Camera[], plan: ReturnType<typeof schedule>) {
  const positions = new Map(cameras.map((c) => [c.id, c.ip]));
  for (const s of plan.steps) {
    expect(positions.get(s.id)).toBe(s.from);
    expect(
      [...positions].filter(([id, ip]) => id !== s.id && ip === s.to),
    ).toEqual([]);
    positions.set(s.id, s.to);
  }
  for (const r of plan.rows.filter((r) => r.state !== "blocked"))
    expect(positions.get(r.id)).toBe(r.to);
}
it("libère une chaîne d’IP occupées dans le bon ordre, sans IP temporaire inutile", () => {
  const cameras = [camera(11), camera(12), camera(13)];
  const result = addressSchedule(
    cameras,
    2,
    new Set(),
    [],
    new Set(cameras.map((c) => c.id)),
    scratch,
  );
  expect(result.steps.map((s) => [s.from, s.to])).toEqual([
    ["192.168.1.13", "192.168.1.14"],
    ["192.168.1.12", "192.168.1.13"],
    ["192.168.1.11", "192.168.1.12"],
  ]);
  expect(result.steps.some((s) => s.kind === "temporary")).toBe(false);
  assertSafe(cameras, result);
});
it("résout deux IP identiques et vérifie la caméra qui conserve son IP sans nouvelle écriture", () => {
  const cameras = [
    camera(11),
    { ...camera(12, 13), ambiguous: true },
    { ...camera(13), ambiguous: true },
    camera(14),
  ];
  const result = schedule(cameras);
  expect(result.rows.every((r) => r.state !== "blocked")).toBe(true);
  expect(result.steps.map((s) => [s.id, s.kind, s.to])).toEqual([
    ["12", "final", "192.168.1.12"],
    ["13", "verify", "192.168.1.13"],
  ]);
  assertSafe(cameras, result);
});
it("permute deux casiers par une seule IP temporaire, en excluant les IP occupées et du poste", () => {
  const cameras = [camera(11), camera(12)];
  const result = schedule(
    cameras,
    [
      { id: "11", locker: 2 },
      { id: "12", locker: 1 },
    ],
    new Set([scratch[0]]),
  );
  expect(result.steps.map((s) => [s.from, s.to, s.kind])).toEqual([
    ["192.168.1.12", scratch[1], "temporary"],
    ["192.168.1.11", "192.168.1.12", "final"],
    [scratch[1], "192.168.1.11", "final"],
  ]);
  assertSafe(cameras, result);
  expect(cameras.map((c) => c.ip)).toEqual(["192.168.1.11", "192.168.1.12"]);
});
it("bloque un cycle non ciblable ou sans IP temporaire, sans déplacement partiel", () => {
  const cameras = [camera(11), camera(12)];
  const assignments = [
    { id: "11", locker: 2 },
    { id: "12", locker: 1 },
  ];
  for (const result of [
    schedule(cameras, assignments, new Set(), new Set()),
    schedule(cameras, assignments, new Set(scratch)),
  ]) {
    expect(result.steps).toEqual([]);
    expect(result.rows.every((r) => r.state === "blocked")).toBe(true);
  }
});
it("ne déplace ni un équipement extérieur, ni une caméra exclue, ni une identité ambiguë non ciblable", () => {
  const cameras = [camera(11), camera(12)];
  expect(schedule(cameras, [{ id: "11", locker: 2 }]).steps).toEqual([]);
  expect(
    schedule([camera(13)], undefined, new Set(["192.168.1.11"])).steps,
  ).toEqual([]);
  const duplicates = [camera(11), { ...camera(12, 11), ambiguous: true }];
  const result = schedule(duplicates, undefined, new Set(), new Set(["11"]));
  expect(result.steps).toEqual([]);
});
it("toutes les permutations de quatre caméras évitent les destinations encore occupées", () => {
  const cameras = [11, 12, 13, 14].map((n) => camera(n));
  function permutations(values: number[]): number[][] {
    return values.length
      ? values.flatMap((v, i) =>
          permutations(values.filter((_, j) => i !== j)).map((p) => [v, ...p]),
        )
      : [[]];
  }
  for (const order of permutations([1, 2, 3, 4])) {
    const plan = schedule(
      cameras,
      cameras.map((c, i) => ({ id: c.id, locker: order[i] })),
    );
    expect(plan.rows.some((r) => r.state === "blocked")).toBe(false);
    assertSafe(cameras, plan);
  }
});
function fixture() {
  const cameras = [camera(11), camera(12)];
  const plan: AddressPlan = {
    id: "plan",
    createdAt: new Date().toISOString(),
    ...schedule(cameras, [
      { id: "11", locker: 2 },
      { id: "12", locker: 1 },
    ]),
  };
  const devices = Object.fromEntries(
    cameras.map((c) => [
      c.id,
      {
        root: "XML_ANJVISION",
        serial: c.serial,
        mac: c.mac,
        ip: c.ip,
        lan: {
          IPAddress: c.ip,
          Netmask: "255.255.255.0",
          DHCP: "0",
          Gateway: "192.168.1.1",
          MTU: "1400",
        },
      },
    ]),
  );
  const service: any = Object.create(CameraService.prototype);
  const journal = vi.fn(async () => {});
  Object.assign(service, {
    cameras,
    sessionGeneration: 1,
    guard: { assert: vi.fn(async () => ({})), ensureEpoch: vi.fn() },
    addressPlan: {
      plan,
      epoch: 0,
      session: 1,
      cameras: structuredClone(cameras),
      lanDevices: devices,
    },
    confirm: vi.fn(async () => true),
    log: new Diagnostics(),
    profileJournal: { backupVendor: journal },
    changeIP: vi.fn(),
    verifyLanAddress: vi.fn(),
    changeLanAddress: vi.fn(async (id: string, expected: any, to: string) => {
      expect(expected.ip).toBe(cameras.find((c) => c.id === id)!.ip);
      expect(expected.lan.MTU).toBe("1400");
      cameras.find((c) => c.id === id)!.ip = to;
      return { verified: true, message: "Relu" };
    }),
  });
  return { service, plan, cameras, journal };
}
it("exécute et journalise chaque étape, actualise l’état attendu et confirme les IP temporaires", async () => {
  const f = fixture();
  const progress: any[] = [];
  f.service.onAddressProgress = (p: unknown) => progress.push(p);
  const result = await f.service.applyAddresses(f.plan.id);
  expect(result.rows.every((r: any) => r.state === "verified")).toBe(true);
  expect(f.service.changeIP).not.toHaveBeenCalled();
  expect(f.service.changeLanAddress).toHaveBeenCalledTimes(3);
  expect(f.service.confirm.mock.calls[0][0]).toContain(
    "192.168.1.254 (temporaire)",
  );
  expect(f.service.changeLanAddress.mock.calls[2][1].ip).toBe("192.168.1.254");
  expect(f.service.changeLanAddress.mock.calls[2][5]).toBe(true);
  expect(progress.at(-1)).toMatchObject({ completed: 3, total: 3 });
  expect(f.journal).toHaveBeenCalledTimes(5);
  await expect(f.service.applyAddresses(f.plan.id)).rejects.toThrow("expiré");
});
it("arrête après un échec et conserve l’IP temporaire dans le bilan, sans rollback ni répétition", async () => {
  const f = fixture();
  f.service.changeLanAddress
    .mockImplementationOnce(async (id: string, _: unknown, to: string) => {
      f.cameras.find((c) => c.id === id)!.ip = to;
      return { verified: true, message: "Relu" };
    })
    .mockRejectedValueOnce(Error("Cible encore occupée"));
  const result = await f.service.applyAddresses(f.plan.id);
  expect(f.service.changeLanAddress).toHaveBeenCalledTimes(2);
  expect(result.steps.map((s: any) => s.state)).toEqual([
    "verified",
    "failed",
    "skipped",
  ]);
  expect(result.rows.find((r: any) => r.id === "12")).toMatchObject({
    state: "skipped",
    lastVerifiedIP: "192.168.1.254",
  });
  expect(f.cameras.find((c) => c.id === "12")!.ip).toBe("192.168.1.254");
});
it("ne continue pas si le journal ne peut plus conserver les étapes", async () => {
  const f = fixture();
  f.journal
    .mockResolvedValueOnce(undefined)
    .mockRejectedValue(Error("disk full"));
  const result = await f.service.applyAddresses(f.plan.id);
  expect(f.service.changeLanAddress).toHaveBeenCalledOnce();
  expect(result.warning).toContain("disk full");
  expect(result.rows.find((r: any) => r.id === "12").lastVerifiedIP).toBe(
    "192.168.1.254",
  );
});
it("applique un plan de conflits sans casier et transmet le masque propre à chaque caméra", async () => {
  const f = fixture();
  f.plan.kind = "conflicts";
  f.plan.rows.forEach((r) => delete r.locker);
  Object.values(f.service.addressPlan.lanDevices).forEach(
    (d: any) => (d.lan.Netmask = "255.255.254.0"),
  );
  const result = await f.service.applyAddresses(f.plan.id);
  expect(result.rows.every((r: any) => r.state === "verified")).toBe(true);
  expect(
    f.service.changeLanAddress.mock.calls.every(
      (args: any[]) => args[6] === "255.255.254.0",
    ),
  ).toBe(true);
  expect(f.service.confirm.mock.calls[0][0]).not.toMatch(/casier|undefined/);
});
