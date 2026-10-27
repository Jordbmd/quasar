import path from "node:path";
import type { Adapter } from "../../shared/types";
import { ipNumber } from "../ip";
import { run, type Run, type SystemNetwork } from "./contract";
import {
  records,
  text,
  netmask,
  macAddress,
  probeNeighbor,
} from "./structured";

// Numeric CIM values avoid parsing localized display strings. All commands are read-only.
export const windowsInventory = `
$allIPs = @(Get-NetIPAddress -ErrorAction Stop)
$allInterfaces = @(Get-NetIPInterface -ErrorAction Stop)
@(Get-NetAdapter -IncludeHidden -ErrorAction Stop | ForEach-Object {
  $a = $_
  $ips = @($allIPs | Where-Object { $_.InterfaceIndex -eq $a.ifIndex -and [int]$_.AddressFamily -eq 2 -and [int]$_.AddressState -eq 4 -and -not $_.SkipAsSource })
  $nic = $allInterfaces | Where-Object { $_.InterfaceIndex -eq $a.ifIndex -and [int]$_.AddressFamily -eq 2 } | Select-Object -First 1
  [pscustomobject]@{ id = [int]$a.ifIndex; name = $a.Name; description = $a.InterfaceDescription;
    physical = [bool]$a.HardwareInterface; virtual = [bool]$a.Virtual;
    media = [int]$a.NdisPhysicalMedium; type = [int]$a.InterfaceType;
    enabled = ([int]$a.InterfaceAdminStatus -eq 1); connected = ([int]$a.MediaConnectState -eq 1);
    mac = $a.MacAddress; mtu = [int]$nic.NlMtu; dhcp = ([int]$nic.Dhcp -eq 1);
    addresses = @($ips | ForEach-Object { [pscustomobject]@{ address = $_.IPAddress; prefix = [int]$_.PrefixLength } }) }
}) | ConvertTo-Json -Depth 5 -Compress`;

function index(id: string) {
  if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 0xffffffff)
    throw Error("Index Ethernet invalide.");
  return id;
}
export function parseWindowsAdapters(json: string): Adapter[] {
  return records(json).map((a) => {
    const id = index(String(a.id));
    const addresses = records(JSON.stringify(a.addresses ?? []));
    const ipv4 = addresses.length === 1 ? addresses[0] : undefined;
    if (ipv4) ipNumber(text(ipv4.address));
    return {
      id,
      service: text(a.name),
      label: text(a.description),
      mac: macAddress(a.mac),
      kind:
        a.physical === true &&
        a.virtual === false &&
        a.type === 6 &&
        (a.media === 14 || a.media === 0)
          ? "ethernet"
          : "other",
      enabled: a.enabled === true,
      link: a.connected === true,
      address: text(ipv4?.address),
      mask: ipv4 ? netmask(ipv4.prefix) : "",
      mode: a.dhcp === true ? "dhcp" : "manual",
      router: "",
      dns: [],
      clientId: "",
      raw: "",
      mtu: typeof a.mtu === "number" ? a.mtu : undefined,
      issue:
        addresses.length > 1
          ? "Plusieurs IPv4 sur cette interface : adresse source ambiguë."
          : undefined,
    };
  });
}
export class WindowsNetwork implements SystemNetwork {
  constructor(private command: Run = run) {}
  private powershell(script: string) {
    const executable = path.win32.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    const prelude =
      "$ErrorActionPreference='Stop'; [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ";
    return this.command(
      executable,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(prelude + script, "utf16le").toString("base64"),
      ],
      10000,
    );
  }
  async list() {
    return parseWindowsAdapters(await this.powershell(windowsInventory));
  }
  async route(ip: string, id: string, source?: string) {
    ipNumber(ip);
    index(id);
    if (!source) throw Error("Adresse source Ethernet indisponible.");
    ipNumber(source);
    const routes = records(
      await this.powershell(
        `@(Find-NetRoute -RemoteIPAddress '${ip}' -LocalIPAddress '${source}' -InterfaceIndex ${id} -ErrorAction Stop | Where-Object { $_.DestinationPrefix } | Select-Object InterfaceIndex,DestinationPrefix) | ConvertTo-Json -Compress`,
      ),
    );
    if (
      routes.length !== 1 ||
      String(routes[0].InterfaceIndex) !== id ||
      !routes[0].DestinationPrefix
    )
      throw Error("La route Ethernet n’est pas vérifiée par Windows.");
    return id;
  }
  async neighbors(id: string) {
    const rows = records(
      await this.powershell(
        `@(Get-NetNeighbor -InterfaceIndex ${index(id)} -AddressFamily IPv4 -ErrorAction Stop | Where-Object { [int]$_.State -gt 1 } | Select-Object IPAddress,LinkLayerAddress,InterfaceIndex) | ConvertTo-Json -Compress`,
      ),
    );
    return rows
      .filter(
        (n) =>
          String(n.InterfaceIndex) === id && macAddress(n.LinkLayerAddress),
      )
      .map((n) => {
        ipNumber(text(n.IPAddress));
        return { ip: text(n.IPAddress), mac: macAddress(n.LinkLayerAddress) };
      });
  }
  probe = probeNeighbor;
}
