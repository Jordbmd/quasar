import type { Camera } from "../shared/types";
import type { AddressRow } from "../shared/addressing";
import { lockerIP, ipNumber } from "./ip";

export function addressRows(
  cameras: Camera[],
  start: number,
  occupied: Set<string>,
  own: string[],
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
    if (c.ambiguous || cameras.filter((x) => x.ip === c.ip).length > 1) {
      state = "blocked";
      message =
        "IP partagée : utilisez Résoudre le conflit et branchez une seule des caméras concernées.";
    } else if (
      (!c.mac && !c.serial) ||
      c.connectionError ||
      !c.status.startsWith("Connectée")
    ) {
      state = "blocked";
      message = "Connexion et identité à vérifier avant l’adressage.";
    } else if (
      own.includes(to) ||
      (to !== c.ip && (occupied.has(to) || cameras.some((x) => x.ip === to)))
    ) {
      state = "blocked";
      message =
        "Adresse cible déjà utilisée. Choisissez un autre premier casier.";
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
    };
  });
}
