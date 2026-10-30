import { expect, it, vi } from "vitest";
import { CameraService } from "../src/main/service";

function fixture() {
  const camera = { id: "camera", ip: "192.168.1.13" };
  const nic = {
    IPv4: {
      config: {
        DHCP: false,
        manual: [{ address: camera.ip, prefixLength: 23 }],
      },
    },
  };
  const conn = {
    camera,
    closed: false,
    writeAttempts: 0,
    call: vi.fn(async (method: string) => {
      if (method === "getNetworkInterfaces") return [nic];
      throw Error("Lecture étrangère au changement IP : " + method);
    }),
    identity: vi.fn(async () => {}),
    feature: async (work: () => Promise<unknown>) => ({
      state: "available",
      data: await work(),
    }),
    detail: vi.fn(async () => {
      throw Error("Relecture complète interdite");
    }),
  };
  const service: any = Object.create(CameraService.prototype);
  Object.assign(service, {
    writeGuard: vi.fn(async () => conn),
    changeIP: vi.fn(async () => ({ verified: true })),
    camera: () => camera,
    connection: async () => conn,
    guard: { epoch: 0, ensureEpoch: vi.fn() },
    connections: new Map([[camera.id, conn]]),
    details: new Map(),
    osdStore: { read: async () => undefined },
    uncertain: new Set(),
  });
  return { service, conn, camera, nic };
}

it("une IP seule conserve le masque actuel et ne lit ni DNS ni passerelle", async () => {
  const { service, conn } = fixture();
  await service.setCameraNetwork({
    id: "camera",
    address: "192.168.1.20",
    isolated: false,
  });
  expect(service.changeIP).toHaveBeenCalledExactlyOnceWith(
    {
      id: "camera",
      address: "192.168.1.20",
      mask: "255.255.254.0",
      isolated: false,
    },
    false,
    true,
  );
  expect(conn.call.mock.calls).toEqual([["getNetworkInterfaces"]]);
});

it("un masque seul conserve l’adresse actuelle", async () => {
  const { service } = fixture();
  await service.setCameraNetwork({
    id: "camera",
    mask: "255.255.255.0",
    isolated: false,
  });
  expect(service.changeIP).toHaveBeenCalledExactlyOnceWith(
    {
      id: "camera",
      address: "192.168.1.13",
      mask: "255.255.255.0",
      isolated: false,
    },
    false,
    true,
  );
});

it("un changement de mode externe ne désactive pas implicitement DHCP", async () => {
  const { service, nic } = fixture();
  nic.IPv4.config.DHCP = true;
  await expect(
    service.setCameraNetwork({
      id: "camera",
      address: "192.168.1.20",
      isolated: false,
    }),
  ).rejects.toThrow("mode IP a changé");
  expect(service.changeIP).not.toHaveBeenCalled();
});

it("l’actualisation réseau conserve vidéo et OSD sans les interroger", async () => {
  const { service, conn, camera } = fixture();
  const cached = {
    camera,
    network: { state: "available" },
    video: { state: "available", data: ["video"] },
    osd: { state: "available", data: ["osd"] },
  };
  service.details.set(camera.id, cached);
  conn.call.mockImplementation(async () => []);
  const result = await service.cameraDetail(
    camera.id,
    true,
    undefined,
    undefined,
    "network",
  );
  expect(result.video).toBe(cached.video);
  expect(result.osd).toBe(cached.osd);
  expect(conn.detail).not.toHaveBeenCalled();
  expect(conn.call.mock.calls.map(([method]) => method)).toEqual([
    "getNetworkInterfaces",
    "getNetworkDefaultGateway",
    "getDNS",
  ]);
});

it("le forçage ne contourne que l’occupation cible, jamais l’identité source", async () => {
  const { service, camera } = fixture();
  Object.assign(service, {
    cameras: [camera, { id: "other", ip: "192.168.1.20" }],
    discoveryRead: { at: Date.now(), epoch: 0 },
  });
  service.guard.assert = async () => ({ address: "192.168.1.2", id: "eth" });
  service.guard.system = {
    probe: async () => {},
    neighbors: async () => [{ ip: "192.168.1.20", mac: "02:00:00:00:00:20" }],
  };
  await expect(service.conflict(camera, "192.168.1.20")).rejects.toThrow(
    "déjà observée",
  );
  await expect(service.conflict(camera, "192.168.1.20", true)).resolves.toBe(
    true,
  );
  Object.assign(camera, { ambiguous: true });
  await expect(service.conflict(camera, "192.168.1.20", true)).rejects.toThrow(
    "Plusieurs identités",
  );
});

it.each([true, false])(
  "le doublon exige la confirmation native (acceptée : %s)",
  async (accepted) => {
    const { service, conn, camera } = fixture();
    const peer = { id: "other", ip: "192.168.1.20", ambiguous: false };
    const peerDestroy = vi.fn();
    Object.assign(conn, {
      destroy: vi.fn(),
      setIPv4: vi.fn(async () => {
        conn.writeAttempts++;
        return "<RebootNeeded>false</RebootNeeded>";
      }),
    });
    Object.assign(service, {
      changeIP: CameraService.prototype.changeIP,
      cameras: [camera, peer],
      conflict: vi.fn(async () => true),
      approve: vi.fn(async () => {
        if (!accepted) throw Error("Opération annulée.");
        return conn;
      }),
      profileJournal: { backupVendor: vi.fn(async () => {}) },
      video: { stop: vi.fn(async () => {}) },
      log: { add: vi.fn(), safe: String },
    });
    service.connections.set(peer.id, { destroy: peerDestroy });
    service.guard.assert = async () => ({
      address: "192.168.1.2",
      mask: "255.255.255.0",
    });
    service.guard.ownAddresses = () => ["192.168.1.2"];
    const pending = service.changeIP(
      {
        id: camera.id,
        address: peer.ip,
        mask: "255.255.255.0",
        isolated: false,
      },
      true,
      true,
    );
    if (!accepted) {
      await expect(pending).rejects.toThrow("annulée");
      expect(conn.writeAttempts).toBe(0);
      expect(peerDestroy).not.toHaveBeenCalled();
      return;
    }
    const result = await pending;
    expect(service.approve.mock.calls[0][1]).toContain("DOUBLON");
    expect(service.approve.mock.calls[0][2]).toBe(true);
    expect(result).toMatchObject({
      sent: true,
      acknowledged: true,
      verified: false,
    });
    expect(peer.ambiguous).toBe(true);
    expect(service.connections.size).toBe(0);
    expect(peerDestroy).toHaveBeenCalledOnce();
    expect(conn.call.mock.calls).toEqual([
      ["getNetworkInterfaces"],
      ["getNetworkInterfaces"],
    ]);
  },
);
