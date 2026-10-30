import dgram from "node:dgram";
import { isIPv4 } from "node:net";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { Camera } from "../shared/types";
import { host, ipNumber, prefix } from "./ip";

// Anjvision NETSDK 2.1: search=1, LAN configuration by serial=2,
// discovery response=3, UDP/3001. No native SDK or account data is retained.
export type LanDevice = {
  root: "XML_ANJVISION" | "XML_TOPSEE";
  serial: string;
  mac: string;
  ip: string;
  lan: Record<string, string>;
};
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false,
  parseAttributeValue: false,
});
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&apos;");
const validSerial = (s: string) => /^[A-Z0-9]{16}$/.test(s) && !/^0+$/.test(s);
const validMac = (s: string) =>
  /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(s) &&
  !["00:00:00:00:00:00", "ff:ff:ff:ff:ff:ff"].includes(s) &&
  (parseInt(s.slice(0, 2), 16) & 1) === 0;

export function lanBroadcast(address: string, mask: string) {
  host(address, mask);
  prefix(mask);
  const value = (ipNumber(address) | ~ipNumber(mask)) >>> 0;
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}
function envelope(root: LanDevice["root"], code: 1 | 2, body = "") {
  return `<?xml version="1.0" encoding="UTF-8"?><${root}><MESSAGE_HEADER Msg_type="SYSTEM_SEARCHIPC_MESSAGE" Msg_code="${code}" Msg_flag="0"/><MESSAGE_BODY>${body}</MESSAGE_BODY></${root}>`;
}
export function parseLanDevice(
  xml: string,
  source: string,
): LanDevice | undefined {
  if (
    xml.length > 16384 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    return;
  try {
    const doc = parser.parse(xml);
    const root = doc.XML_ANJVISION ? "XML_ANJVISION" : "XML_TOPSEE";
    const message = doc[root];
    const header = message?.MESSAGE_HEADER;
    if (
      header?.["@_Msg_type"] !== "SYSTEM_SEARCHIPC_MESSAGE" ||
      header["@_Msg_code"] !== "3" ||
      header["@_Msg_flag"] !== "0"
    )
      return;
    const body = message.MESSAGE_BODY;
    const serial = body?.IPC_SERIALNUMBER?.["@_SerialNumber"];
    if (typeof serial !== "string" || !validSerial(serial)) return;
    const raw = body?.LANConfig;
    if (!raw || Array.isArray(raw) || typeof raw !== "object") return;
    const lan: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (
        !/^@_[A-Za-z][A-Za-z0-9_]*$/.test(key) ||
        typeof value !== "string" ||
        value.length > 256 ||
        /[\x00-\x1f&<>]/.test(value)
      )
        return;
      // Do not retain credentials even if an unexpected firmware returns them.
      if (/pass|secret|credential|token/i.test(key)) return;
      lan[key.slice(2)] = value;
    }
    const mac = lan.MacAddress?.toLowerCase();
    const ip = lan.IPAddress;
    if (
      !mac ||
      !validMac(mac) ||
      !isIPv4(ip) ||
      ip !== source ||
      !["0", "1"].includes(lan.DHCP)
    )
      return;
    host(ip, lan.Netmask);
    for (const key of ["Gateway", "DNS1", "DNS2"])
      if (!isIPv4(lan[key])) return;
    return { root, serial, mac, ip, lan };
  } catch {
    return;
  }
}
export function lanFingerprint(device: LanDevice) {
  return JSON.stringify([
    device.root,
    device.serial,
    device.mac,
    device.ip,
    Object.entries(device.lan).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}
export function matchLanDevice(camera: Camera, devices: LanDevice[]) {
  const matches = devices.filter(
    (d) =>
      d.ip === camera.ip &&
      (camera.mac
        ? camera.mac.toLowerCase() === d.mac
        : // Observed ONVIF endpoint layout of this protocol, never arbitrary suffixes.
          camera.endpoint?.toLowerCase() ===
          `urn:uuid:1419d68a-1dd2-11b2-a105-${d.mac.replaceAll(":", "")}`),
  );
  if (matches.length !== 1) return;
  const d = matches[0];
  if (
    devices.filter((x) => x.serial === d.serial).length !== 1 ||
    devices.filter((x) => x.mac === d.mac).length !== 1
  )
    return;
  return d;
}
export function lanChange(device: LanDevice, address: string, mask: string) {
  if (!validSerial(device.serial) || !validMac(device.mac))
    throw Error("Identité réseau constructeur invalide.");
  host(address, mask);
  const lan = { ...device.lan, IPAddress: address, Netmask: mask, DHCP: "0" };
  return envelope(
    device.root,
    2,
    `<IPC_SERIALNUMBER SerialNumber="${device.serial}"/><LANConfig ${Object.entries(
      lan,
    )
      .map(([k, v]) => `${k}="${escape(v)}"`)
      .join(" ")}/>`,
  );
}
export async function discoverLan(
  address: string,
  mask: string,
  signal: AbortSignal,
  createSocket: () => dgram.Socket = () => dgram.createSocket("udp4"),
  timeout = 3500,
): Promise<LanDevice[]> {
  const destination = lanBroadcast(address, mask);
  return new Promise((resolve, reject) => {
    const socket = createSocket();
    const found = new Map<string, LanDevice>();
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      try {
        socket.close();
      } catch {
        /* Not bound yet. */
      }
      error ? reject(error) : resolve([...found.values()]);
    };
    const abort = () =>
      finish(Error("Recherche réseau constructeur interrompue."));
    const timer = setTimeout(() => finish(), timeout);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) return abort();
    socket.on("error", finish);
    socket.on("message", (buffer, remote) => {
      if (
        done ||
        remote.port !== 3001 ||
        remote.address === address ||
        buffer.length > 16384
      )
        return;
      const device = parseLanDevice(buffer.toString("utf8"), remote.address);
      if (device && found.size < 512) found.set(lanFingerprint(device), device);
    });
    socket.bind(0, address, () => {
      if (done) return;
      try {
        socket.setBroadcast(true);
        socket.send(
          Buffer.from(envelope("XML_ANJVISION", 1)),
          3001,
          destination,
          (error) => {
            if (error) finish(error);
          },
        );
      } catch (e) {
        finish(e as Error);
      }
    });
  });
}
// One datagram only. Its send callback is not a camera acknowledgement.
export async function sendLanChange(
  address: string,
  mask: string,
  device: LanDevice,
  target: string,
  signal: AbortSignal,
  createSocket: () => dgram.Socket = () => dgram.createSocket("udp4"),
) {
  const destination = lanBroadcast(address, mask);
  const payload = Buffer.from(lanChange(device, target, "255.255.255.0"));
  return new Promise<void>((resolve, reject) => {
    const socket = createSocket();
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      try {
        socket.close();
      } catch {
        /* Not bound yet. */
      }
      error ? reject(error) : resolve();
    };
    const abort = () =>
      finish(Error("Attribution interrompue ; résultat à vérifier."));
    const timer = setTimeout(
      () =>
        finish(
          Error(
            "Envoi interrompu ; résultat à vérifier, aucune répétition automatique.",
          ),
        ),
      4000,
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) return abort();
    socket.on("error", finish);
    socket.bind(0, address, () => {
      if (done) return;
      try {
        socket.setBroadcast(true);
        socket.send(payload, 3001, destination, (error) =>
          finish(error || undefined),
        );
      } catch (e) {
        finish(e as Error);
      }
    });
  });
}
