import { OSDStore } from "../src/main/osd";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { host, lockerIP, prefix, cameraAddress, overlap } from "../src/main/ip";
import {
  Diagnostics,
  redact,
  bounded,
  reconnect,
} from "../src/main/diagnostics";
import { NetworkGuard } from "../src/main/network";
import {
  MacNetwork,
  parseInfo,
  parseServices,
  type SystemNetwork,
} from "../src/main/platform";
import {
  identityMatches,
  markAmbiguity,
  parseMatches,
  discoveryError,
} from "../src/main/discovery";
import { CameraService, schemas } from "../src/main/service";
import { validateVideo, escapeTree, matchInterface } from "../src/main/onvif";
import type { Adapter, Camera } from "../src/shared/types";
it("explique un refus d’envoi multicast sans déclarer le Wi-Fi déconnecté", () => {
  const original = Object.assign(
    new Error("send EHOSTUNREACH 239.255.255.250:3702"),
    { code: "EHOSTUNREACH" },
  );
  const err = discoveryError(original, "192.168.1.26");
  expect(err.message).toContain("autorisez Quasar");
  expect(err.message).toContain("Réseau local");
  expect(err.message).toContain("Ajouter par IP");
  expect(err.cause).toBe(original);
  const cancelled = new Error("Découverte interrompue.");
  expect(discoveryError(cancelled, "192.168.1.26")).toBe(cancelled);
});
const adapter: Adapter = {
  id: "en7",
  service: "USB Ethernet",
  label: "USB Ethernet",
  mac: "aa:bb:cc:dd:ee:ff",
  kind: "ethernet",
  enabled: true,
  link: false,
  mode: "dhcp",
  address: "",
  mask: "",
  router: "",
  dns: [],
  clientId: "atelier",
  raw: "DHCP Configuration",
};
class FakeNetwork implements SystemNetwork {
  adapters = [
    structuredClone(adapter),
    {
      ...structuredClone(adapter),
      id: "en0",
      kind: "other" as const,
      service: "Wi-Fi",
    },
  ];
  routeDevice = "en7";
  apply = vi.fn(async (a: Adapter, p: any) => {
    Object.assign(
      this.adapters.find((x) => x.id === a.id)!,
      { ...p, mode: "manual", router: "", dns: [] },
    );
  });
  restore = vi.fn(async (a: Adapter) => {
    Object.assign(
      this.adapters.find((x) => x.id === a.id)!,
      a,
    );
  });
  probe = vi.fn(async () => {});
  neighbors = vi.fn(async () => []);
  async list() {
    return structuredClone(this.adapters);
  }
  async route(_ip: string, _interfaceId: string) {
    return this.routeDevice;
  }
  async sharing() {
    return "unknown" as const;
  }
}
async function fixture() {
  const system = new FakeNetwork();
  const dir = await mkdtemp(path.join(tmpdir(), "sezaam-test-"));
  const log = new Diagnostics();
  const g = new NetworkGuard(system, log);
  await g.refresh();
  return { g, system, dir, log };
}
async function validated() {
  const f = await fixture();
  Object.assign(f.system.adapters[0], {
    link: true,
    address: "10.79.42.1",
    mask: "255.255.255.0",
    mode: "dhcp",
  });
  await f.g.refresh();
  return f;
}
describe("IPv4 et règle casier", () => {
  it("calcule les casiers 1, 25 et 244", () => {
    expect(lockerIP(1)).toBe("192.168.1.11");
    expect(lockerIP(25)).toBe("192.168.1.35");
    expect(lockerIP(244)).toBe("192.168.1.254");
  });
  it.each([0, -1, 245, 1.5, NaN, Infinity])(
    "refuse un numéro invalide %s",
    (n) => expect(() => lockerIP(n)).toThrow(),
  );
  it.each([
    "192.168.1.0",
    "192.168.1.255",
    "127.0.0.1",
    "0.1.1.1",
    "224.0.0.1",
    "255.255.255.255",
    "169.254.1.2",
    "192.168.1.999",
    "1.2.3",
  ])("refuse les adresses réservées %s", (ip) =>
    expect(() => host(ip, "255.255.255.0")).toThrow(),
  );
  it("valide le masque et les sous-réseaux", () => {
    expect(prefix("255.255.254.0")).toBe(23);
    expect(() => prefix("255.0.255.0")).toThrow();
    expect(() => prefix("255.255.255.255")).toThrow();
    expect(() =>
      cameraAddress(
        "192.168.2.3",
        "255.255.255.0",
        "192.168.1.1",
        "255.255.255.0",
      ),
    ).toThrow();
    expect(() =>
      cameraAddress(
        "192.168.1.1",
        "255.255.255.0",
        "192.168.1.1",
        "255.255.255.0",
      ),
    ).toThrow();
    expect(() =>
      cameraAddress(
        "192.168.1.63",
        "255.255.255.0",
        "192.168.1.1",
        "255.255.255.0",
        ["192.168.1.63"],
      ),
    ).toThrow();
    expect(
      overlap("10.1.2.1", "255.255.255.0", "10.1.0.2", "255.255.0.0"),
    ).toBe(true);
  });
});
describe("Réseau en lecture seule", () => {
  it("accepte le DHCP sans préparation ni validation", async () => {
    const { g, system } = await validated();
    expect((await g.assert("10.79.42.11")).mode).toBe("dhcp");
    expect(system.apply).not.toHaveBeenCalled();
    expect(system.restore).not.toHaveBeenCalled();
  });
  it("ne bascule jamais vers le Wi-Fi quand le hub est débranché", async () => {
    const { g, system } = await fixture();
    Object.assign(system.adapters[1], {
      link: true,
      address: "192.168.1.26",
      mask: "255.255.255.0",
    });
    await g.refresh();
    expect(g.state.ready).toBe(false);
    await expect(g.assert()).rejects.toThrow("Branchez le hub");
    system.adapters = [system.adapters[1]];
    await g.refresh();
    expect(g.state.adapter).toBeUndefined();
    await expect(g.assert()).rejects.toThrow("Branchez le hub");
  });
  it("détecte le hub branché après le démarrage et invalide au débranchement", async () => {
    const { g, system } = await fixture();
    Object.assign(system.adapters[0], {
      link: true,
      address: "10.79.42.1",
      mask: "255.255.255.0",
    });
    expect((await g.assert()).id).toBe("en7");
    const fn = vi.fn();
    g.onSuspend(fn);
    const epoch = g.epoch;
    system.adapters = [system.adapters[1]];
    await expect(g.assert()).rejects.toThrow("Branchez le hub");
    expect(fn).toHaveBeenCalledOnce();
    expect(() => g.ensureEpoch(epoch)).toThrow();
    system.adapters.push({
      ...adapter,
      id: "en8",
      link: true,
      address: "10.79.42.2",
      mask: "255.255.255.0",
    });
    expect((await g.assert()).id).toBe("en8");
  });
  it("refuse plusieurs chemins Ethernet actifs plutôt que de cibler un réseau arbitraire", async () => {
    const { g, system } = await validated();
    system.adapters.push({
      ...system.adapters[0],
      id: "en8",
      service: "Second hub",
    });
    await expect(g.assert()).rejects.toThrow("Plusieurs connexions Ethernet");
    expect(g.state.ready).toBe(false);
  });
  it("signale un câble actif sans IPv4 et ignore les services désactivés", async () => {
    const { g, system } = await fixture();
    system.adapters[0].link = true;
    await expect(g.assert()).rejects.toThrow("IPv4 indisponible");
    system.adapters[0].enabled = false;
    await g.refresh();
    expect(g.state.adapter).toBeUndefined();
  });
  it("refuse un chemin réseau différent", async () => {
    const { g, system } = await validated();
    system.routeDevice = "en0";
    await expect(g.assert("10.79.42.11")).rejects.toThrow("ne passe pas");
  });
  it("contrôle la route Ethernet liée aux sockets malgré une route Wi-Fi générale", async () => {
    const { g, system } = await validated();
    const command = vi.fn(async (_file: string, args: string[]) =>
      args.includes("-ifscope") ? "interface: en7" : "interface: en0",
    );
    const mac = new MacNetwork(command);
    system.route = mac.route.bind(mac);
    await expect(g.assert("10.79.42.11")).resolves.toMatchObject({ id: "en7" });
    expect(command).toHaveBeenCalledWith("/sbin/route", [
      "-n",
      "get",
      "-ifscope",
      "en7",
      "10.79.42.11",
    ]);
    command.mockResolvedValue("interface: en0");
    await expect(g.assert("10.79.42.11")).rejects.toThrow("ne passe pas");
    command.mockRejectedValue(new Error("route absente"));
    await expect(g.assert("10.79.42.11")).rejects.toThrow("route absente");
  });
  it("explique l’absence de DHCP sans bloquer la découverte link-local", async () => {
    const { g, system } = await validated();
    Object.assign(system.adapters[0], {
      address: "169.254.254.50",
      mask: "255.255.0.0",
    });
    await g.refresh();
    expect(g.state.ready).toBe(true);
    expect(g.state.warning).toContain("Aucune adresse DHCP reçue");
    expect(g.state.warning).toContain("port LAN");
    expect(g.state.warning).toContain("169.254.254.50");
    // A self-assigned address must never bypass the Ethernet route guard.
    system.routeDevice = "en0";
    await expect(g.assert("192.168.1.11")).rejects.toThrow("ne passe pas");
    system.adapters[0].address = "192.168.10.50";
    system.adapters[0].mask = "255.255.255.0";
    await g.refresh();
    expect(g.state.warning).toBeUndefined();
  });
  it("distingue l’attente DHCP d’une connexion Ethernet débranchée", async () => {
    const { g, system } = await fixture();
    system.adapters[0].link = true;
    await g.refresh();
    expect(g.state.ready).toBe(false);
    expect(g.state.reason).toContain("attente d’une adresse DHCP");
    expect(g.state.reason).not.toContain("Branchez le hub");
  });
  it("invalide les connexions quand l’adresse change", async () => {
    const { g, system } = await validated();
    const fn = vi.fn();
    g.onSuspend(fn);
    const epoch = g.epoch;
    system.adapters[0].address = "10.79.42.2";
    await g.refresh();
    expect(fn).toHaveBeenCalledOnce();
    expect(() => g.ensureEpoch(epoch)).toThrow();
  });
  it("n’expose plus d’actions de modification du Mac", () => {
    expect(schemas).not.toHaveProperty("prepareNetwork");
    expect(schemas).not.toHaveProperty("restoreNetwork");
    expect(schemas).not.toHaveProperty("validateNetwork");
    expect(schemas).not.toHaveProperty("selectAdapter");
    expect(NetworkGuard.prototype).not.toHaveProperty("select");
    expect(MacNetwork.prototype).not.toHaveProperty("apply");
    expect(MacNetwork.prototype).not.toHaveProperty("privileged");
  });
  it.each(["(null)", "none", ""])("normalise le routeur absent %s", (router) =>
    expect(parseInfo("Router: " + router).router).toBe(""),
  );
  it("conserve une passerelle existante", () =>
    expect(parseInfo("Router: 192.168.1.254").router).toBe("192.168.1.254"));
  it("extrait les services réseau", () =>
    expect(
      parseServices(
        "(1) USB Ethernet\n(Hardware Port: USB Ethernet, Device: en7)",
      )[0].id,
    ).toBe("en7"));
});
function cam(id: string, endpoint: string, ip = "10.79.42.11"): Camera {
  return {
    id,
    endpoint,
    ip,
    port: 80,
    path: "/onvif/device_service",
    status: "",
    ambiguous: false,
    model: "TEST",
    serial: "SERIAL-A",
    mac: "aa:bb:cc:00:11:22",
  };
}
describe("Identités et découverte", () => {
  it("bloque deux UUID à la même IP", () => {
    const list = markAmbiguity([cam("a", "uuid:a"), cam("b", "uuid:b")]);
    expect(list.every((x) => x.ambiguous)).toBe(true);
  });
  it("ne confond pas deux caméras du même modèle", () => {
    expect(
      identityMatches(cam("a", "a"), { ...cam("b", "b"), serial: "SERIAL-B" }),
    ).toBe(false);
    expect(
      identityMatches(cam("a", "a"), { ...cam("a", "a"), ip: "10.0.0.12" }),
    ).toBe(true);
    expect(
      identityMatches({ ...cam("a", "a"), serial: "", mac: "" }, cam("b", "b")),
    ).toBe(false);
  });
  it("sélectionne l’interface caméra portant son IP", () => {
    const a = {
      $: { token: "eth1" },
      IPv4: { config: { manual: { address: "10.0.0.11" } } },
    };
    expect(matchInterface([{ $: { token: "eth0" } }, a], "10.0.0.11")).toBe(a);
    expect(() => matchInterface([a, a], "10.0.0.11")).toThrow("ambiguë");
  });
  it("corrèle RelatesTo et interdit des XAddr externes", () => {
    const xml =
      '<s:Envelope xmlns:s="urn:s"><s:Header><RelatesTo>urn:test</RelatesTo></s:Header><s:Body><ProbeMatches><ProbeMatch><EndpointReference><Address>uuid:a</Address></EndpointReference><XAddrs>http://10.0.0.11/onvif/device_service http://example.com/</XAddrs></ProbeMatch></ProbeMatches></s:Body></s:Envelope>';
    expect(parseMatches(xml, "urn:test", "10.0.0.11")).toHaveLength(1);
    expect(parseMatches(xml, "urn:other", "10.0.0.11")).toHaveLength(0);
    expect(parseMatches(xml, "urn:test", "10.0.0.12")).toHaveLength(0);
  });
});
describe("Délais, validation et journaux", () => {
  it("borne un appel sans rejouer une écriture", async () => {
    const cancel = vi.fn();
    await expect(bounded(new Promise(() => {}), 15, cancel)).rejects.toThrow(
      "Délai dépassé",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("réessaie uniquement la relecture lors d’une reconnexion", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ serial: "a" });
    expect(
      await reconnect<{ serial: string }>(read, (x) => x.serial === "a", 2, 1),
    ).toEqual({ serial: "a" });
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("refuse une identité différente après reconnexion", async () => {
    await expect(
      reconnect(
        async () => ({ serial: "b" }),
        (x) => x.serial === "a",
        2,
        1,
      ),
    ).rejects.toThrow("Identité");
  });
  it("masque mots de passe, jetons, URL et XML", () => {
    const out = redact(
      "password=secret token=xyz rtsp://admin:secret@10.0.0.1/stream?auth=x <wsse:Password>abc</wsse:Password> secret",
      ["secret"],
    );
    expect(out).not.toContain("secret");
    expect(out).not.toContain("xyz");
    expect(out).not.toContain("10.0.0.1");
    expect(out).not.toContain("abc");
  });
  it("échappe les chaînes pour les setters ONVIF", () =>
    expect(escapeTree({ name: 'A&B<"', token: "x" })).toEqual({
      name: "A&amp;B&lt;&quot;",
      token: "x",
    }));
  it("refuse des paramètres hors capacités caméra", () => {
    const e = {
      config: { encoding: "H264" },
      options: {
        state: "available",
        data: {
          H264: {
            resolutionsAvailable: [{ width: 640, height: 480 }],
            frameRateRange: { min: 1, max: 25 },
          },
        },
      },
    };
    expect(() =>
      validateVideo(e, { width: 640, height: 480, fps: 10 }),
    ).not.toThrow();
    expect(() =>
      validateVideo(e, { width: 2304, height: 1296, fps: 10 }),
    ).toThrow();
    expect(() =>
      validateVideo(e, { width: 640, height: 480, fps: 30 }),
    ).toThrow();
  });
  it("refuse une charge IPC additionnelle ou invalide", () => {
    expect(() =>
      schemas.addCamera.parse({ ip: "127.0.0.1", port: 70000 }),
    ).toThrow();
    expect(() =>
      schemas.setImage.parse({
        id: "f0a8a4e2-5e8a-46c7-9829-5bb34a57d167",
        values: { factoryReset: 1 },
      }),
    ).toThrow();
  });
});

describe("Vérifications supplémentaires des écritures", () => {
  it("ne touche pas une autre caméra et bloque une identité ambiguë", async () => {
    const { g, log } = await validated();
    const service = new CameraService(
      g,
      log,
      { stop: vi.fn(async () => {}) } as any,
      async () => true,
      async () => {},
      async () => "",
      new OSDStore(await mkdtemp(path.join(tmpdir(), "sezaam-osd-test-"))),
    );
    const first = cam("one", "urn:one", "10.79.42.11"),
      second = cam("two", "urn:two", "10.79.42.12");
    service.cameras.push(first, second);
    const one = {
      camera: first,
      identity: vi.fn(async () => ({ ...first })),
      closed: false,
    };
    const two = {
      camera: second,
      identity: vi.fn(async () => ({ ...second })),
      closed: false,
    };
    service.connections.set("one", one as any);
    service.connections.set("two", two as any);
    expect(await service.writeGuard("one")).toBe(one);
    expect(two.identity).not.toHaveBeenCalled();
    first.ambiguous = true;
    await expect(service.writeGuard("one")).rejects.toThrow("ambiguë");
    expect(one.identity).toHaveBeenCalledTimes(1);
  });
  it("ne rejoue pas un setter après timeout et bloque la prochaine écriture", async () => {
    const { g, log } = await validated();
    const service = new CameraService(
      g,
      log,
      { stop: vi.fn(async () => {}) } as any,
      async () => true,
      async () => {},
      async () => "",
      new OSDStore(await mkdtemp(path.join(tmpdir(), "sezaam-osd-test-"))),
    );
    service.cameras.push(cam("one", "urn:one", "10.79.42.11"));
    const send = vi.fn(async () => {
      throw new Error("timeout");
    });
    const read = vi.fn(async () => false);
    const result = await service.writeAndVerify("one", send, read);
    expect(result.acknowledged).toBe(false);
    expect(result.verified).toBe(false);
    expect(send).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledTimes(4);
    await expect(service.writeGuard("one")).rejects.toThrow("incertain");
  });
  it("rejette une IP observée malgré une affirmation d’isolation", async () => {
    const { g, system, log } = await validated();
    const service = new CameraService(
      g,
      log,
      { stop: vi.fn(async () => {}) } as any,
      async () => true,
      async () => {},
      async () => "",
      new OSDStore(await mkdtemp(path.join(tmpdir(), "sezaam-osd-test-"))),
    );
    const one = cam("one", "urn:one", "10.79.42.11");
    service.cameras.push(one);
    service.discovery = vi.fn(async () => service.cameras);
    system.neighbors = vi.fn(async () => [
      { ip: "10.79.42.12", mac: "aa:bb:cc:00:11:33" },
    ]) as any;
    await expect(service.conflict(one, "10.79.42.12")).rejects.toThrow(
      "déjà observée",
    );
  });
  it("masque aussi les objets et JSON contenant des secrets inconnus", () => {
    const s = redact({
      password: "p@s$w0rd",
      token: "abc123",
      authorization: "Bearer xyz",
    });
    expect(s).not.toContain("p@s$w0rd");
    expect(s).not.toContain("abc123");
  });
});
