import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { networkInterfaces } from "node:os";
import type { Adapter } from "../shared/types";
import { ipNumber } from "./ip";
const exec = promisify(execFile);
export type Run = (
  file: string,
  args: string[],
  timeout?: number,
) => Promise<string>;
export const run: Run = async (file, args, timeout = 6000) => {
  const r = await exec(file, args, {
    timeout,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  });
  if (/AuthorizationCreate\(\) failed|Error:/.test(r.stdout))
    throw new Error(r.stdout.trim());
  return r.stdout.trim();
};
export interface SystemNetwork {
  list(): Promise<Adapter[]>;
  route(ip: string, interfaceId: string): Promise<string>;
  neighbors(id: string): Promise<{ ip: string; mac: string }[]>;
  probe(ip: string, source: string): Promise<void>;
}
export function parseServices(s: string) {
  return [
    ...s.matchAll(
      /^\((\d+|\*)\) (.+)\n\(Hardware Port: (.*), Device: (.*)\)/gm,
    ),
  ].map((m) => ({
    service: m[2],
    label: m[3],
    id: m[4],
    enabled: m[1] !== "*",
  }));
}
export function parseInfo(raw: string) {
  const get = (key: string) =>
    raw.match(new RegExp("^" + key + ": (.*)$", "m"))?.[1] ?? "";
  // networksetup reports an unset router as either "none" or "(null)".
  const router = get("Router").trim();
  return {
    mode: (/^DHCP Configuration/m.test(raw)
      ? "dhcp"
      : /^Manual Configuration/m.test(raw)
        ? "manual"
        : /DHCP.*Manual|Manual.*DHCP/i.test(raw)
          ? "dhcp-manual"
          : /^IPv4: Off/m.test(raw)
            ? "off"
            : "unknown") as Adapter["mode"],
    address: get("IP address"),
    mask: get("Subnet mask"),
    router: /^(?:none|\(null\))$/i.test(router) ? "" : router,
    clientId: get("Client ID"),
    raw,
  };
}
export class MacNetwork implements SystemNetwork {
  constructor(private command: Run = run) {}
  async list() {
    const services = parseServices(
      await this.command("/usr/sbin/networksetup", [
        "-listnetworkserviceorder",
      ]),
    );
    const ips = networkInterfaces();
    const all = await this.command("/sbin/ifconfig", []);
    return Promise.all(
      services
        .filter((s) => s.id)
        .map(async (s) => {
          const block =
            all
              .split(new RegExp("(?:^|\\n)" + s.id + ":"))[1]
              ?.split(/\n[^\t\s]/)[0] ?? "";
          const info = parseInfo(
            await this.command("/usr/sbin/networksetup", [
              "-getinfo",
              s.service,
            ]),
          );
          const dns = await this.command("/usr/sbin/networksetup", [
            "-getdnsservers",
            s.service,
          ]);
          const addr = ips[s.id]?.find((x) => x.family === "IPv4");
          return {
            ...s,
            ...info,
            kind: (/ethernet|lan|100\/1000|10\/100|usb.*(gbe|gigabit)/i.test(
              s.label,
            ) &&
            /^en\d+$/.test(s.id) &&
            !/wi-fi|iphone|bridge|thunderbolt [123]/i.test(s.label)
              ? "ethernet"
              : "other") as Adapter["kind"],
            link: /status: active/.test(block),
            mtu: Number(block.match(/mtu (\d+)/)?.[1]) || undefined,
            media: block.match(/media: (.*)/)?.[1]?.trim(),
            mac: block.match(/ether ([\da-f:]+)/)?.[1] ?? "",
            address: info.address || addr?.address || "",
            mask: info.mask || addr?.netmask || "",
            dns: dns.includes("aren't any")
              ? []
              : dns.split("\n").filter((x) => /^[:\da-f.]+$/i.test(x)),
          };
        }),
    );
  }
  async route(ip: string, interfaceId: string) {
    ipNumber(ip);
    if (!/^en\d+$/.test(interfaceId))
      throw new Error("Interface Ethernet invalide.");
    // All camera transports bind their local address to this interface.
    // Darwin has separate scoped routes when Ethernet and Wi-Fi overlap;
    // the unscoped lookup describes a different, unbound socket.
    const out = await this.command("/sbin/route", [
      "-n",
      "get",
      "-ifscope",
      interfaceId,
      ip,
    ]);
    return out.match(/interface: (\S+)/)?.[1] ?? "";
  }
  async neighbors(id: string) {
    const text = await this.command("/usr/sbin/arp", ["-an"]);
    return [
      ...text.matchAll(/\((\d+\.\d+\.\d+\.\d+)\) at ([\da-f:]+) on (\S+)/gi),
    ]
      .filter((m) => m[3] === id)
      .map((m) => ({
        ip: m[1],
        mac: m[2]
          .split(":")
          .map((s) => s.padStart(2, "0"))
          .join(":")
          .toLowerCase(),
      }));
  }
  async probe(ip: string, source: string) {
    ipNumber(ip);
    ipNumber(source);
    try {
      await this.command(
        "/sbin/ping",
        ["-n", "-c", "1", "-W", "500", "-S", source, ip],
        2000,
      );
    } catch {
      /* A failed ping never proves the address is free. */
    }
  }
}
export class UnsupportedNetwork implements SystemNetwork {
  async list() {
    return [];
  }
  async route() {
    throw new Error("Plateforme réseau non implémentée.");
    return "";
  }
  async neighbors() {
    return [];
  }
  async probe() {
    throw new Error("Plateforme non prise en charge.");
  }
}
