import { isIPv4 } from "node:net";
export function ipNumber(ip: string): number {
  if (!isIPv4(ip)) throw new Error("Adresse IPv4 invalide.");
  return ip.split(".").reduce((v, n) => (v * 256 + Number(n)) >>> 0, 0);
}
export function prefix(mask: string): number {
  const bits = ipNumber(mask).toString(2).padStart(32, "0");
  if (!/^1+0+$/.test(bits))
    throw new Error("Masque non contigu ou réseau sans adresses hôtes.");
  const n = bits.indexOf("0");
  if (n > 30)
    throw new Error("Le masque doit laisser au moins deux adresses hôtes.");
  return n;
}
export function host(ip: string, mask: string) {
  const n = ipNumber(ip),
    m = ipNumber(mask);
  prefix(mask);
  const first = n >>> 24;
  if (first === 0 || first === 127 || first >= 224 || n >>> 16 === 0xa9fe)
    throw new Error("Adresse réservée, locale ou multicast interdite.");
  if ((n & m) >>> 0 === n || ((n & m) | ~m) >>> 0 === n)
    throw new Error("Adresse réseau ou de broadcast interdite.");
}
export function sameSubnet(a: string, b: string, mask: string) {
  return (ipNumber(a) & ipNumber(mask)) === (ipNumber(b) & ipNumber(mask));
}
export function overlap(a: string, am: string, b: string, bm: string) {
  const m = ipNumber(am) & ipNumber(bm);
  return (ipNumber(a) & m) === (ipNumber(b) & m);
}
export function cameraAddress(
  ip: string,
  mask: string,
  local: string,
  localMask: string,
  own: string[] = [],
) {
  host(ip, mask);
  host(ip, localMask);
  if (!sameSubnet(ip, local, mask) || !sameSubnet(ip, local, localMask))
    throw new Error(
      "La caméra doit rester dans le sous-réseau de la connexion Ethernet.",
    );
  if ([local, ...own].includes(ip))
    throw new Error("Cette adresse appartient au Mac.");
}
export function lockerIP(n: number) {
  if (!Number.isInteger(n) || n < 1 || n > 244)
    throw new Error("Le numéro de casier doit être compris entre 1 et 244.");
  const ip = `192.168.1.${n + 10}`;
  host(ip, "255.255.255.0");
  return ip;
}
