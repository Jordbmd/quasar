import { afterEach, expect, it, vi } from "vitest";
import { CameraService } from "../src/main/service";
import { CameraConnection } from "../src/main/onvif";
import * as discovery from "../src/main/discovery";
import { Diagnostics } from "../src/main/diagnostics";
const mac = "02:00:00:00:00:16";
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const c = {
    id: "cam",
    ip: "192.168.1.16",
    endpoint: "urn:camera-a",
    port: 80,
    path: "/onvif/device_service",
    status: "Conflit",
    ambiguous: true,
    mac,
    serial: "SERIAL-A",
  };
  const service: any = Object.create(CameraService.prototype);
  const guard: any = {
    epoch: 0,
    assert: async () => ({
      id: "en9",
      address: "192.168.1.2",
      mask: "255.255.255.0",
    }),
    ensureEpoch: (e: number) => {
      if (e !== guard.epoch) throw Error("Réseau modifié");
    },
    system: {
      probe: async () => {},
      neighbors: async () => [{ ip: c.ip, mac }],
    },
  };
  Object.assign(service, {
    cameras: [c, { ...c, id: "other", endpoint: "urn:camera-b" }],
    credentials: { username: "test", password: "fixture-only" },
    guard,
    abort: new AbortController(),
    connections: new Map(),
    details: new Map(),
    uncertain: new Set(),
    log: new Diagnostics(),
  });
  const discover = vi.spyOn(discovery, "discoverOnInterface");
  const connect = vi
    .spyOn(CameraConnection.prototype, "connect")
    .mockImplementation(async function (this: CameraConnection) {
      this.camera.status = "Connectée · lecture seule";
    });
  vi.spyOn(CameraConnection.prototype, "identity").mockImplementation(
    async function (this: CameraConnection) {
      return this.camera;
    },
  );
  return { service, c, guard, discover, connect };
}
it("ne tente aucune authentification tant que deux identités partagent encore l’IP", async () => {
  const f = fixture();
  f.discover.mockResolvedValue(f.service.cameras);
  await expect(f.service.resolveIPConflict("cam")).rejects.toThrow(
    "n’est pas seule",
  );
  expect(f.connect).not.toHaveBeenCalled();
  expect(f.c.ambiguous).toBe(true);
});
it("refuse la mauvaise caméra isolée et une disparition lors de la seconde recherche", async () => {
  const f = fixture();
  f.discover.mockResolvedValue([{ ...f.c, endpoint: "urn:camera-b" }]);
  await expect(f.service.resolveIPConflict("cam")).rejects.toThrow("choisie");
  f.discover.mockResolvedValueOnce([f.c]).mockResolvedValueOnce([]);
  await expect(f.service.resolveIPConflict("cam")).rejects.toThrow(
    "ne répond pas",
  );
  expect(f.connect).not.toHaveBeenCalled();
});
it("lève le conflit seulement après deux découvertes, authentification et concordance MAC", async () => {
  const f = fixture();
  f.discover.mockResolvedValue([f.c]);
  try {
    const result = await f.service.resolveIPConflict("cam");
    expect(f.discover).toHaveBeenCalledTimes(2);
    expect(result.ambiguous).toBe(false);
    expect(f.service.cameras).toHaveLength(1);
    expect(f.service.connections.has("cam")).toBe(true);
  } finally {
    f.service.connections.get("cam")?.destroy();
  }
});
it("maintient le conflit si les voisins Ethernet désignent une autre caméra", async () => {
  const f = fixture();
  f.discover.mockResolvedValue([f.c]);
  f.guard.system.neighbors = async () => [
    { ip: f.c.ip, mac: "02:00:00:00:00:ff" },
  ];
  await expect(f.service.resolveIPConflict("cam")).rejects.toThrow(
    "Ethernet non confirmée",
  );
  expect(f.c.ambiguous).toBe(true);
  expect(f.service.connections.size).toBe(0);
});
