import net from "node:net";
import { ipNumber } from "../ip";

/** OS output is untrusted; invalid output must never validate a route. */
export function records(text: string): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(text.replace(/^\uFEFF/, "") || "[]");
  const list = parsed == null ? [] : Array.isArray(parsed) ? parsed : [parsed];
  if (list.some((v) => !v || typeof v !== "object" || Array.isArray(v)))
    throw Error("Réponse réseau système invalide.");
  return list as Record<string, unknown>[];
}
export const text = (v: unknown) => (typeof v === "string" ? v : "");
export function netmask(prefix: unknown): string {
  if (
    typeof prefix !== "number" ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 32
  )
    throw Error("Préfixe IPv4 système invalide.");
  const n = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join(".");
}
export function interfaceName(id: string) {
  if (!/^[a-zA-Z0-9_.:-]{1,64}$/.test(id))
    throw Error("Interface système invalide.");
  return id;
}
export function macAddress(value: unknown) {
  const mac = text(value).replaceAll("-", ":").toLowerCase();
  return /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) &&
    mac !== "00:00:00:00:00:00"
    ? mac
    : "";
}
/** A source-bound TCP attempt populates neighbours without raw-socket privileges.
 * Failure is deliberately inconclusive: only discovery + identity permits writes. */
export async function probeNeighbor(ip: string, source: string) {
  ipNumber(ip);
  ipNumber(source);
  await new Promise<void>((resolve) => {
    const socket = net.connect({ host: ip, port: 80, localAddress: source });
    const timer = setTimeout(() => socket.destroy(), 500);
    socket.once("connect", () => socket.destroy());
    socket.once("error", () => socket.destroy());
    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
