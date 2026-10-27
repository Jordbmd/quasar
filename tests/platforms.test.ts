import { describe, it, expect, vi } from "vitest";
import { LinuxNetwork } from "../src/main/platforms/linux";
import {
  WindowsNetwork,
  parseWindowsAdapters,
  windowsInventory,
} from "../src/main/platforms/windows";
import { NetworkGuard } from "../src/main/network";
import { Diagnostics } from "../src/main/diagnostics";
import { records, netmask } from "../src/main/platforms/structured";
import type { Run } from "../src/main/platforms/contract";
const linux = (name = "enx001122", extra = {}) => ({
  ifname: name,
  flags: ["UP", "LOWER_UP"],
  link_type: "ether",
  address: "02:00:00:00:00:01",
  mtu: 1500,
  addr_info: [{ family: "inet", local: "192.0.2.2", prefixlen: 24 }],
  ...extra,
});
const win = (extra = {}) => ({
  id: 7,
  name: "Ethernet USB – étage",
  description: "USB GbE",
  physical: true,
  virtual: false,
  type: 6,
  media: 14,
  enabled: true,
  connected: true,
  mac: "02-00-00-00-00-01",
  dhcp: false,
  addresses: [{ address: "192.0.2.2", prefix: 24 }],
  ...extra,
});
it("rejette les sorties système invalides et conserve un masque /0", () => {
  expect(() => records("not JSON")).toThrow();
  expect(() => records("[42]")).toThrow();
  expect(netmask(0)).toBe("0.0.0.0");
  expect(netmask(24)).toBe("255.255.255.0");
  expect(() => netmask(33)).toThrow();
});
describe("Linux : contrats iproute2, jamais de LAN réel", () => {
  it("distingue USB physique, Wi-Fi, VPN et câble débranché", async () => {
    const command = vi
      .fn<Run>()
      .mockResolvedValue(
        JSON.stringify([
          linux(),
          linux("wlan0"),
          linux("tun0"),
          linux("eth1", { flags: ["UP"], addr_info: [] }),
        ]),
      );
    const n = new LinuxNetwork(
      command,
      async (id) => id !== "wlan0" && id !== "tun0",
    );
    const list = await n.list();
    expect(list.map((a) => a.kind)).toEqual([
      "ethernet",
      "other",
      "other",
      "ethernet",
    ]);
    expect(list[0]).toMatchObject({
      address: "192.0.2.2",
      mask: "255.255.255.0",
      link: true,
    });
    expect(list[3].link).toBe(false);
    expect(command).toHaveBeenCalledWith("ip", [
      "-j",
      "-details",
      "address",
      "show",
    ]);
  });
  it("ne choisit pas arbitrairement une IPv4 ou une route et filtre les voisins incomplets", async () => {
    const command = vi.fn<Run>().mockResolvedValue(
      JSON.stringify([
        linux("eth0", {
          addr_info: [
            ...linux().addr_info,
            { family: "inet", local: "198.51.100.2", prefixlen: 24 },
          ],
        }),
      ]),
    );
    const n = new LinuxNetwork(command, async () => true);
    expect((await n.list())[0]).toMatchObject({
      address: "",
      issue: expect.stringContaining("ambiguë"),
    });
    command.mockResolvedValue('[{"dev":"eth0"}]');
    expect(await n.route("192.0.2.11", "eth0", "192.0.2.2")).toBe("eth0");
    expect(command).toHaveBeenLastCalledWith("ip", [
      "-j",
      "-4",
      "route",
      "get",
      "192.0.2.11",
      "from",
      "192.0.2.2",
      "oif",
      "eth0",
    ]);
    command.mockResolvedValue('[{"dev":"wlan0"}]');
    await expect(n.route("192.0.2.11", "eth0", "192.0.2.2")).rejects.toThrow();
    command.mockResolvedValue(
      '[{"dev":"eth0","dst":"192.0.2.11","lladdr":"02:00:00:00:00:11","state":["STALE"]},{"dev":"eth0","dst":"192.0.2.12","state":["INCOMPLETE"]}]',
    );
    expect(await n.neighbors("eth0")).toEqual([
      { ip: "192.0.2.11", mac: "02:00:00:00:00:11" },
    ]);
  });
});
describe("Windows : contrats PowerShell, pas une exécution Windows", () => {
  it("normalise JSON unique/tableau sans dépendre de la langue et exclut les cartes virtuelles", () => {
    expect(parseWindowsAdapters(JSON.stringify(win()))[0]).toMatchObject({
      id: "7",
      kind: "ethernet",
      service: "Ethernet USB – étage",
      mask: "255.255.255.0",
    });
    expect(
      parseWindowsAdapters(
        JSON.stringify([
          win({ virtual: true }),
          win({ type: 71, media: 9 }),
          win({ addresses: [], connected: false }),
        ]),
      ).map((a) => [a.kind, a.link]),
    ).toEqual([
      ["other", true],
      ["other", true],
      ["ethernet", false],
    ]);
    expect(parseWindowsAdapters("null")).toEqual([]);
    expect(windowsInventory).not.toMatch(/Set-Net|Remove-Net|Enable-Net/);
  });
  it("utilise l’adresse source et l’index pour vérifier la route", async () => {
    const command = vi
      .fn<Run>()
      .mockResolvedValue(
        '[{"InterfaceIndex":7,"DestinationPrefix":"192.0.2.0/24"}]',
      );
    const n = new WindowsNetwork(command);
    expect(await n.route("192.0.2.11", "7", "192.0.2.2")).toBe("7");
    const args = command.mock.calls[0][1];
    const script = Buffer.from(args.at(-1)!, "base64").toString("utf16le");
    expect(script).toContain("-LocalIPAddress '192.0.2.2' -InterfaceIndex 7");
    await expect(
      n.route("192.0.2.11", "7;Stop-Process", "192.0.2.2"),
    ).rejects.toThrow();
    command.mockResolvedValue("[]");
    await expect(n.route("192.0.2.11", "7", "192.0.2.2")).rejects.toThrow(
      "pas vérifiée",
    );
  });
});
it.each(["ENOENT", "EACCES", "EPERM"])(
  "l’erreur %s laisse l’application consultable et invalide la session",
  async (code) => {
    const command = vi.fn<Run>().mockResolvedValue(JSON.stringify([linux()]));
    const guard = new NetworkGuard(
      new LinuxNetwork(command, async () => true),
      new Diagnostics(),
    );
    await guard.refresh();
    const epoch = guard.epoch;
    const suspended = vi.fn();
    guard.onSuspend(suspended);
    command.mockRejectedValue(Object.assign(Error("test"), { code }));
    expect((await guard.refresh()).ready).toBe(false);
    expect(suspended).toHaveBeenCalledOnce();
    expect(() => guard.ensureEpoch(epoch)).toThrow();
    await expect(guard.assert()).rejects.toThrow();
  },
);
