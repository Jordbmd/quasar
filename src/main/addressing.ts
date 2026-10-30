import type { Camera } from "../shared/types";
import type { AddressRow } from "../shared/addressing";
import { lockerIP, ipNumber } from "./ip";

export function addressRows(
  cameras: Camera[],
  start: number,
  occupied: Set<string>,
  own: string[],
  serialTargets: Set<string> = new Set(),
): AddressRow[] {
  if (
    !cameras.length ||
    cameras.length > 244 ||
    !Number.isInteger(start) ||
    start < 1 ||
    start + cameras.length - 1 > 244
  )
    throw Error("Choisissez une plage de casiers comprise entre 1 et 244.");
  const sorted = [...cameras].sort(
    (a, b) =>
      ipNumber(a.ip) - ipNumber(b.ip) ||
      (a.mac || a.endpoint || a.id).localeCompare(b.mac || b.endpoint || b.id),
  );
  return sorted.map((c, index) => {
    const locker = start + index,
      to = lockerIP(locker);
    let message =
      "Adresse disponible selon la détection. Nouvelle vérification avant écriture.";
    let state: AddressRow["state"] = c.ip === to ? "unchanged" : "ready";
    const conflict =
      c.ambiguous || cameras.filter((x) => x.ip === c.ip).length > 1;
    const serial = serialTargets.has(c.id);
    if (conflict && !serial) {
      state = "blocked";
      message =
        "IP partagée : aucun ciblage constructeur unique confirmé. La résolution automatique est indisponible pour cette caméra.";
    } else if (
      !serial &&
      ((!c.mac && !c.serial) ||
        c.connectionError ||
        !c.status.startsWith("Connectée"))
    ) {
      state = "blocked";
      message = "Connexion et identité à vérifier avant l’adressage.";
    } else if (
      own.includes(to) ||
      (serial && to === c.ip) ||
      cameras.some((x) => x.id !== c.id && x.ip === to) ||
      (to !== c.ip && occupied.has(to))
    ) {
      state = "blocked";
      message =
        "Adresse cible déjà utilisée. Choisissez un autre premier casier.";
    } else if (serial) {
      state = "ready";
      message =
        "Conflit résoluble par identifiant constructeur. Aucun débranchement nécessaire.";
    } else if (state === "unchanged") message = "Adresse déjà conforme.";
    return {
      id: c.id,
      name: c.name || c.model || "Caméra",
      identity: c.mac || c.serial || c.endpoint || c.id,
      from: c.ip,
      to,
      locker,
      state,
      message,
      ...(serial ? { resolution: "serial" as const } : {}),
    };
  });
}
