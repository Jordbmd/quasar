import { EventEmitter } from "node:events";
import type { Socket } from "node:dgram";
import { afterEach, expect, it, vi } from "vitest";
import {
  discoverLan,
  parseLanDevice,
  matchLanDevice,
  lanChange,
  lanFingerprint,
  sendLanChange,
  type LanDevice,
} from "../src/main/lan-addressing";
import { addressRows } from "../src/main/addressing";
import { CameraService } from "../src/main/service";
import * as lan from "../src/main/lan-addressing";
import * as discovery from "../src/main/discovery";
import type { Camera } from "../src/shared/types";
import { Diagnostics } from "../src/main/diagnostics";

const xml = (
  serial = "EF00000000000001",
  mac = "02:00:00:00:00:01",
  ip = "192.0.2.132",
) =>
  `<XML_ANJVISION><MESSAGE_HEADER Msg_type="SYSTEM_SEARCHIPC_MESSAGE" Msg_code="3" Msg_flag="0"/><MESSAGE_BODY><IPC_SERIALNUMBER SerialNumber="${serial}"/><LANConfig MacAddress="${mac}" IPAddress="${ip}" DHCP="0" Netmask="255.255.255.0" Gateway="192.0.2.1" DNS1="192.0.2.1" DNS2="0.0.0.0" ALLNET="0" hostname="test" MTU="1400"/><UserConfig><Account Password="never-retain-this"/></UserConfig></MESSAGE_BODY></XML_ANJVISION>`;
const device = parseLanDevice(xml(), "192.0.2.132")!;
const camera: Camera = {
  id: "camera-a",
  ip: device.ip,
  port: 80,
  path: "/onvif/device_service",
  endpoint: "urn:uuid:1419d68a-1dd2-11b2-a105-020000000001",
  ambiguous: true,
  status: "Conflit",
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("lit le réseau constructeur sans conserver les comptes et refuse XML dangereux ou ambigu", () => {
  expect(device.serial).toBe("EF00000000000001");
  expect(JSON.stringify(device)).not.toMatch(/Account|Password|never-retain/);
  expect(device.lan.MTU).toBe("1400");
  for (const invalid of [
    xml().replace('Msg_code="3"', 'Msg_code="2"'),
    xml("0000000000000000"),
    xml().replace("<LANConfig", "<!DOCTYPE x><LANConfig"),
    xml().replace('MTU="1400"', 'Password="secret"'),
    xml().replace('MTU="1400"', 'MTU="a&amp;b"'),
  ])
    expect(parseLanDevice(invalid, device.ip)).toBeUndefined();
  expect(parseLanDevice(xml(), "192.0.2.99")).toBeUndefined();
});
it("distingue deux appareils à la même IP, refuse les séries/MAC réutilisées et ne déduit pas une identité d’un suffixe arbitraire", () => {
  const other = parseLanDevice(
    xml("EF00000000000002", "02:00:00:00:00:02"),
    device.ip,
  )!;
  expect(matchLanDevice(camera, [device, other])).toEqual(device);
  expect(
    matchLanDevice(camera, [device, { ...other, serial: device.serial }]),
  ).toBeUndefined();
  expect(
    matchLanDevice(camera, [device, { ...other, mac: device.mac }]),
  ).toBeUndefined();
  expect(
    matchLanDevice({ ...camera, endpoint: "urn:unknown:020000000001" }, [
      device,
    ]),
  ).toBeUndefined();
  expect(
    matchLanDevice({ ...camera, mac: other.mac }, [device]),
  ).toBeUndefined();
});
it("cible un seul numéro constructeur et préserve les attributs LAN, sans compte ni autre groupe", () => {
  const payload = lanChange(device, "192.0.2.13", "255.255.255.0");
  expect(payload).toContain('Msg_code="2"');
  expect(payload).toContain('SerialNumber="EF00000000000001"');
  expect(payload).toContain('IPAddress="192.0.2.13"');
  expect(payload).toContain('MTU="1400"');
  expect(payload).toContain('Gateway="192.0.2.1"');
  expect(payload).not.toMatch(/UserConfig|MediaStream|Password/);
  expect(() =>
    lanChange({ ...device, serial: "*" }, "192.0.2.13", "255.255.255.0"),
  ).toThrow();
});
function socketFixture() {
  const socket = Object.assign(new EventEmitter(), {
    bind: vi.fn((_port: number, _address: string, callback: () => void) =>
      callback(),
    ),
    setBroadcast: vi.fn(),
    close: vi.fn(),
    send: vi.fn(
      (
        _data: Buffer,
        _port: number,
        _address: string,
        callback: (error: Error | null) => void,
      ) => callback(null),
    ),
  });
  return { socket, create: () => socket as unknown as Socket };
}
it("découverte bornée et liée à Ethernet, conserve les réponses contradictoires pour les bloquer", async () => {
  vi.useFakeTimers();
  const f = socketFixture();
  const work = discoverLan(
    "192.0.2.2",
    "255.255.255.0",
    new AbortController().signal,
    f.create,
  );
  expect(f.socket.bind).toHaveBeenCalledWith(
    0,
    "192.0.2.2",
    expect.any(Function),
  );
  expect(f.socket.send.mock.calls[0].slice(1, 3)).toEqual([
    3001,
    "192.0.2.255",
  ]);
  const remote = { address: device.ip, port: 3001 };
  f.socket.emit("message", Buffer.from(xml()), remote);
  f.socket.emit("message", Buffer.from(xml()), remote);
  f.socket.emit(
    "message",
    Buffer.from(xml().replace('MTU="1400"', 'MTU="1500"')),
    remote,
  );
  f.socket.emit("message", Buffer.from(xml("EF00000000000002")), {
    ...remote,
    port: 99,
  });
  await vi.runAllTimersAsync();
  const found = await work;
  expect(found).toHaveLength(2);
  expect(matchLanDevice(camera, found)).toBeUndefined();
  expect(f.socket.close).toHaveBeenCalledOnce();
});
it("n’envoie jamais deux commandes et ferme la socket sur erreur ou annulation", async () => {
  const f = socketFixture();
  f.socket.send.mockImplementation((_b, _p, _a, cb) =>
    cb(Error("network lost")),
  );
  await expect(
    sendLanChange(
      "192.0.2.2",
      "255.255.255.0",
      device,
      "192.0.2.13",
      new AbortController().signal,
      f.create,
    ),
  ).rejects.toThrow("network lost");
  expect(f.socket.send).toHaveBeenCalledOnce();
  expect(f.socket.close).toHaveBeenCalledOnce();
  const a = socketFixture();
  await expect(
    sendLanChange(
      "192.0.2.2",
      "255.255.255.0",
      device,
      "192.0.2.13",
      AbortSignal.abort(),
      a.create,
    ),
  ).rejects.toThrow("interrompue");
  expect(a.socket.send).not.toHaveBeenCalled();
});
it("le plan inclut les conflits ciblables sans connexion ONVIF mais bloque toujours une cible occupée", () => {
  const cameras = [
    { ...camera, ip: "192.168.1.132" },
    { ...camera, id: "camera-b", ip: "192.168.1.132" },
  ];
  const rows = addressRows(
    cameras,
    1,
    new Set(),
    [],
    new Set(["camera-a", "camera-b"]),
  );
  expect(rows.map((r) => r.state)).toEqual(["ready", "ready"]);
  expect(rows.map((r) => r.to)).toEqual(["192.168.1.11", "192.168.1.12"]);
  expect(rows[0].resolution).toBe("serial");
  expect(
    addressRows(
      cameras,
      1,
      new Set(["192.168.1.11"]),
      [],
      new Set(["camera-a"]),
    )[0].state,
  ).toBe("blocked");
});
function serviceFixture() {
  const before: LanDevice = {
    ...device,
    ip: "192.168.1.132",
    lan: { ...device.lan, IPAddress: "192.168.1.132" },
  };
  const after: LanDevice = {
    ...before,
    ip: "192.168.1.13",
    lan: { ...before.lan, IPAddress: "192.168.1.13" },
  };
  const c = { ...camera, ip: before.ip };
  const service: any = Object.create(CameraService.prototype);
  const guard = {
    epoch: 0,
    assert: vi.fn(async () => ({
      id: "en9",
      address: "192.168.1.2",
      mask: "255.255.255.0",
    })),
    ensureEpoch: (e: number) => {
      if (e !== guard.epoch) throw Error("Réseau modifié");
    },
    ownAddresses: () => ["192.168.1.2"],
    system: {
      probe: vi.fn(async () => {}),
      neighbors: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValue([{ ip: after.ip, mac: before.mac }]),
    },
  };
  Object.assign(service, {
    guard,
    sessionGeneration: 1,
    cameras: [c],
    abort: new AbortController(),
    profileJournal: { backupVendor: vi.fn(async () => {}) },
    stopVideo: vi.fn(async () => {}),
    connections: new Map(),
    details: new Map(),
    attempted: new Set(),
    uncertain: new Set(),
    log: new Diagnostics(),
  });
  const scan = vi
    .spyOn(lan, "discoverLan")
    .mockResolvedValueOnce([before])
    .mockResolvedValue([after]);
  const send = vi.spyOn(lan, "sendLanChange").mockResolvedValue();
  vi.spyOn(discovery, "discoverOnInterface")
    .mockResolvedValueOnce([])
    .mockResolvedValue([{ ...c, ip: after.ip }]);
  return {
    service,
    guard,
    before,
    after,
    c,
    scan,
    send,
    apply: () => service.changeLanAddress(c.id, before, after.ip, 0, 1),
  };
}
it("ne valide l’attribution qu’après série, MAC, configuration, ONVIF et voisin Ethernet concordants", async () => {
  const f = serviceFixture();
  expect((await f.apply()).verified).toBe(true);
  expect(f.send).toHaveBeenCalledOnce();
  expect(f.c.ip).toBe(f.after.ip);
  expect(f.c.ambiguous).toBe(false);
  expect(f.service.uncertain.size).toBe(0);
  expect(f.service.profileJournal.backupVendor).toHaveBeenCalledOnce();
});
it.each(["identity", "occupied", "network", "backup"])(
  "refuse avant écriture : %s",
  async (reason) => {
    const f = serviceFixture();
    if (reason === "identity")
      f.scan
        .mockReset()
        .mockResolvedValue([{ ...f.before, serial: "EF00000000000002" }]);
    if (reason === "occupied")
      f.guard.system.neighbors
        .mockReset()
        .mockResolvedValue([{ ip: f.after.ip, mac: f.before.mac }]);
    if (reason === "network")
      f.service.stopVideo.mockImplementation(async () => {
        f.guard.epoch++;
      });
    if (reason === "backup")
      f.service.profileJournal.backupVendor.mockRejectedValue(
        Error("disk full"),
      );
    await expect(f.apply()).rejects.toThrow();
    expect(f.send).not.toHaveBeenCalled();
  },
);
it("une relecture incorrecte reste incertaine et ne répète pas l’écriture", async () => {
  vi.useFakeTimers();
  const f = serviceFixture();
  f.scan.mockReset().mockResolvedValue([f.before]);
  const work = expect(f.apply()).rejects.toThrow("non confirmée");
  await vi.runAllTimersAsync();
  await work;
  expect(f.send).toHaveBeenCalledOnce();
  expect(f.c.ip).toBe(f.before.ip);
  expect(f.c.ambiguous).toBe(true);
  expect(f.service.uncertain.has(f.c.id)).toBe(true);
  expect(lanFingerprint(f.before)).not.toBe(lanFingerprint(f.after));
});
