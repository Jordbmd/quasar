import dgram from "node:dgram";
import { randomUUID } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { Camera } from "../shared/types";
export function discoveryError(err: Error, address: string): Error {
  const code = (err as NodeJS.ErrnoException).code;
  if (["EHOSTUNREACH", "ENETUNREACH", "EACCES", "EPERM"].includes(code ?? ""))
    return new Error(
      `Découverte automatique impossible depuis ${address} : le système n’a pas pu envoyer la recherche sur le réseau local (${code}). Sur macOS, autorisez Quasar dans la fenêtre système ou dans Réglages Système → Confidentialité et sécurité → Réseau local (Electron en mode développement). Relancez ensuite la détection. Si l’autorisation est déjà activée, quittez et rouvrez Quasar. Vous pouvez aussi essayer « Ajouter par IP » pour tester l’accès direct à une caméra.`,
      { cause: err },
    );
  return err;
}
const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  processEntities: false,
});
export function parseMatches(
  xml: string,
  messageId: string,
  source: string,
): Omit<Camera, "id">[] {
  if (xml.length > 65536 || /<!DOCTYPE|<!ENTITY/i.test(xml)) return [];
  const envelope = parser.parse(xml)?.Envelope;
  if (envelope?.Header?.RelatesTo !== messageId) return [];
  const matches = envelope?.Body?.ProbeMatches?.ProbeMatch;
  return (Array.isArray(matches) ? matches : [matches])
    .filter(Boolean)
    .flatMap((m: any) => {
      const urls = String(m.XAddrs ?? "").split(/\s+/);
      const endpoint = String(m.EndpointReference?.Address ?? "");
      return urls
        .flatMap((s) => {
          try {
            const u = new URL(s);
            if (
              u.protocol !== "http:" ||
              u.hostname !== source ||
              u.username ||
              u.password
            )
              return [];
            return [
              {
                ip: source,
                port: Number(u.port || 80),
                path: u.pathname + u.search,
                endpoint,
                status: "Découverte · non authentifiée",
                ambiguous: false,
              },
            ];
          } catch {
            return [];
          }
        })
        .slice(0, 1);
    });
}
export async function discoverOnInterface(
  address: string,
  mask: string,
  signal: AbortSignal,
  timeout = 3500,
): Promise<Omit<Camera, "id">[]> {
  const id = "urn:uuid:" + randomUUID();
  const body = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl"><s:Header><a:MessageID>${id}</a:MessageID><a:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</a:To><a:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</a:Action></s:Header><s:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></s:Body></s:Envelope>`;
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const found = new Map<string, Omit<Camera, "id">>();
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      try {
        socket.close();
      } catch {}
      err ? reject(discoveryError(err, address)) : resolve([...found.values()]);
    };
    const abort = () => finish(new Error("Découverte interrompue."));
    const timer = setTimeout(() => finish(), timeout);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) return abort();
    socket.on("error", finish);
    socket.on("message", (msg, remote) => {
      try {
        if (remote.address === address) return;
        for (const c of parseMatches(msg.toString(), id, remote.address)) {
          if (found.size < 256) found.set(c.ip + "|" + c.endpoint, c);
        }
      } catch {}
    });
    socket.bind(0, address, () => {
      if (done) return;
      try {
        socket.setMulticastInterface(address);
        socket.setMulticastTTL(1);
        socket.setMulticastLoopback(false);
        socket.send(Buffer.from(body), 3702, "239.255.255.250", (e) => {
          if (e) finish(e);
        });
      } catch (e) {
        finish(e as Error);
      }
    });
  });
}
export function markAmbiguity(cameras: Camera[]) {
  for (const c of cameras) {
    const group = cameras.filter((x) => x.ip === c.ip);
    if (new Set(group.map((x) => x.endpoint || x.id)).size > 1)
      c.ambiguous = true;
  }
  return cameras;
}
export function identityMatches(a: Camera, b: Camera) {
  const serial =
    a.serial?.trim() &&
    !/^(?:0+|unknown|none|null|n\/?a|default|1234567890)$/i.test(
      a.serial.trim(),
    )
      ? a.serial.trim()
      : undefined;
  const mac =
    a.mac &&
    /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(a.mac) &&
    !["00:00:00:00:00:00", "ff:ff:ff:ff:ff:ff"].includes(a.mac.toLowerCase())
      ? a.mac.toLowerCase()
      : undefined;
  if (!serial && !mac) return false;
  if (serial && serial !== b.serial?.trim()) return false;
  if (mac && mac !== b.mac?.toLowerCase()) return false;
  return (
    (!a.model || a.model === b.model) &&
    (!a.manufacturer || a.manufacturer === b.manufacturer)
  );
}
