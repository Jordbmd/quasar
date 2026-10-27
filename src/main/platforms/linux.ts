import { access } from "node:fs/promises";
import type { Adapter } from "../../shared/types";
import { ipNumber } from "../ip";
import { run, type Run, type SystemNetwork } from "./contract";
import {
  records,
  text,
  netmask,
  interfaceName,
  macAddress,
  probeNeighbor,
} from "./structured";

type HardwareKind = (id: string) => Promise<boolean>;
const exists = async (file: string) => {
  try {
    await access(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};
async function physicalEthernet(id: string) {
  const base = `/sys/class/net/${interfaceName(id)}`;
  return (
    (await exists(`${base}/device`)) && !(await exists(`${base}/wireless`))
  );
}

export class LinuxNetwork implements SystemNetwork {
  constructor(
    private command: Run = run,
    private isWired: HardwareKind = physicalEthernet,
  ) {}
  async list(): Promise<Adapter[]> {
    // iproute2 is checked on every call; ENOENT is surfaced by NetworkGuard.
    const links = records(
      await this.command("ip", ["-j", "-details", "address", "show"]),
    );
    return Promise.all(
      links.map(async (link) => {
        const id = interfaceName(text(link.ifname));
        const flags = Array.isArray(link.flags) ? link.flags : [];
        const addresses = records(JSON.stringify(link.addr_info ?? [])).filter(
          (a) => a.family === "inet",
        );
        const address = addresses.length === 1 ? addresses[0] : undefined;
        if (address) ipNumber(text(address.local));
        const physical = link.link_type === "ether" && (await this.isWired(id));
        return {
          id,
          service: text(link.ifalias) || id,
          label: id,
          mac: macAddress(link.address),
          kind: physical ? "ethernet" : "other",
          enabled: flags.includes("UP"),
          link: flags.includes("LOWER_UP"),
          address: text(address?.local),
          mask: address ? netmask(address.prefixlen) : "",
          mode: address
            ? address.dynamic === true
              ? "dhcp"
              : "manual"
            : "unknown",
          router: "",
          dns: [],
          clientId: "",
          raw: "",
          mtu: typeof link.mtu === "number" ? link.mtu : undefined,
          issue:
            addresses.length > 1
              ? "Plusieurs IPv4 sur cette interface : adresse source ambiguë."
              : undefined,
        } satisfies Adapter;
      }),
    );
  }
  async route(ip: string, id: string, source?: string) {
    ipNumber(ip);
    interfaceName(id);
    if (!source) throw Error("Adresse source Ethernet indisponible.");
    ipNumber(source);
    const routes = records(
      await this.command("ip", [
        "-j",
        "-4",
        "route",
        "get",
        ip,
        "from",
        source,
        "oif",
        id,
      ]),
    );
    if (
      routes.length !== 1 ||
      routes[0].dev !== id ||
      routes[0].type === "unreachable" ||
      routes[0].type === "blackhole"
    )
      throw Error("La route Ethernet n’est pas vérifiée par Linux.");
    return id;
  }
  async neighbors(id: string) {
    return records(
      await this.command("ip", [
        "-j",
        "-4",
        "neigh",
        "show",
        "dev",
        interfaceName(id),
      ]),
    )
      .filter(
        (n) =>
          n.dev === id &&
          macAddress(n.lladdr) &&
          !JSON.stringify(n.state).match(/FAILED|INCOMPLETE/),
      )
      .map((n) => {
        ipNumber(text(n.dst));
        return { ip: text(n.dst), mac: macAddress(n.lladdr) };
      });
  }
  probe = probeNeighbor;
}
