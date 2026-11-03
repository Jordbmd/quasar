import type { Camera } from "../shared/types";
import type {
  AddressRow,
  AddressStep,
  LockerAssignment,
} from "../shared/addressing";
import { lockerIP, ipNumber } from "./ip";

export function addressRows(
  cameras: Camera[],
  start: number,
  occupied: Set<string>,
  own: string[],
  serialTargets: Set<string> = new Set(),
  assignments?: LockerAssignment[],
): AddressRow[] {
  if (
    assignments &&
    (!assignments.length ||
      assignments.length > 244 ||
      assignments.some(
        (a) =>
          !Number.isInteger(a.locker) ||
          a.locker < 1 ||
          a.locker > 244 ||
          !cameras.some((c) => c.id === a.id),
      ) ||
      new Set(assignments.map((a) => a.id)).size !== assignments.length ||
      new Set(assignments.map((a) => a.locker)).size !== assignments.length)
  )
    throw Error("Associations caméra–casier invalides. L’IHM 0 est exclue.");
  if (
    !assignments &&
    (!cameras.length ||
      cameras.length > 244 ||
      !Number.isInteger(start) ||
      start < 1 ||
      start + cameras.length - 1 > 244)
  )
    throw Error("Choisissez une plage de casiers comprise entre 1 et 244.");
  const sorted = [...cameras]
    .filter((c) => !assignments || assignments.some((a) => a.id === c.id))
    .sort(
      (a, b) =>
        (assignments
          ? assignments.find((x) => x.id === a.id)!.locker -
            assignments.find((x) => x.id === b.id)!.locker
          : 0) ||
        ipNumber(a.ip) - ipNumber(b.ip) ||
        (a.mac || a.endpoint || a.id).localeCompare(
          b.mac || b.endpoint || b.id,
        ),
    );
  return sorted.map((c, index) => {
    const locker =
        assignments?.find((a) => a.id === c.id)?.locker ?? start + index,
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
      (serial && conflict && to === c.ip) ||
      cameras.some((x) => x.id !== c.id && x.ip === to) ||
      (to !== c.ip && occupied.has(to))
    ) {
      state = "blocked";
      message = assignments
        ? "Adresse cible déjà utilisée. Vérifiez les associations ou libérez cette adresse avant l’attribution."
        : "Adresse cible déjà utilisée. Choisissez un autre premier casier.";
    } else if (serial && c.ip !== to) {
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

// Plan only. Every destination and identity is checked again before execution.
// An occupied address is deferred only when ALL its known holders can leave
// in this same plan. A temporary move always requires serial targeting.
export function addressSchedule(
  cameras: Camera[],
  start: number,
  occupied: Set<string>,
  own: string[],
  serialTargets: Set<string>,
  temporaryCandidates: string[],
  assignments?: LockerAssignment[],
) {
  const rows = addressRows(
    cameras,
    start,
    occupied,
    own,
    serialTargets,
    assignments,
  );
  const eligible = new Set<string>();
  for (const row of rows) {
    const c = cameras.find((c) => c.id === row.id)!;
    const conflict =
      c.ambiguous || cameras.some((p) => p.id !== c.id && p.ip === c.ip);
    const identified =
      serialTargets.has(c.id) ||
      (!conflict &&
        !!(c.mac || c.serial) &&
        !c.connectionError &&
        c.status.startsWith("Connectée"));
    if (
      identified &&
      !own.includes(row.to) &&
      (!occupied.has(row.to) || cameras.some((p) => p.ip === row.to))
    )
      eligible.add(row.id);
  }
  // A blocked or unselected camera must never be moved implicitly.
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows.filter((r) => eligible.has(r.id))) {
      if (
        cameras.some(
          (p) => p.id !== row.id && p.ip === row.to && !eligible.has(p.id),
        )
      ) {
        eligible.delete(row.id);
        changed = true;
      }
    }
  }
  const pending = rows.filter(
    (r) => eligible.has(r.id) && r.state !== "unchanged",
  );
  const positions = new Map(cameras.map((c) => [c.id, c.ip]));
  const reserved = new Set([
    ...occupied,
    ...own,
    ...cameras.map((c) => c.ip),
    ...rows.map((r) => r.to),
  ]);
  const steps: AddressStep[] = [];
  while (pending.length) {
    const index = pending.findIndex(
      (r) => ![...positions].some(([id, ip]) => id !== r.id && ip === r.to),
    );
    if (index !== -1) {
      const [row] = pending.splice(index, 1);
      const from = positions.get(row.id)!;
      steps.push({
        id: row.id,
        from,
        to: row.to,
        kind: from === row.to ? "verify" : "final",
      });
      positions.set(row.id, row.to);
      row.state = "ready";
      row.message = row.temporaryIP
        ? "Passage par une IP temporaire, puis attribution finale sans débranchement."
        : from === row.to
          ? "Adresse conservée ; identité vérifiée après déplacement de l’autre caméra."
          : "Attribution dans l’ordre de libération des adresses, sans débranchement.";
      continue;
    }
    const row = pending.find((r) => serialTargets.has(r.id) && !r.temporaryIP);
    const temporary = temporaryCandidates.find((ip) => !reserved.has(ip));
    if (!row || !temporary) {
      // Do not leave a staged camera without a planned final destination.
      for (const r of rows.filter(
        (r) => eligible.has(r.id) && r.state !== "unchanged",
      )) {
        r.state = "blocked";
        r.message = !temporary
          ? "Aucune IP temporaire disponible selon les contrôles réseau."
          : "Permutation bloquée : ciblage constructeur nécessaire pour une IP temporaire.";
        delete r.temporaryIP;
      }
      return { rows, steps: [] };
    }
    row.temporaryIP = temporary;
    reserved.add(temporary);
    steps.push({
      id: row.id,
      from: positions.get(row.id)!,
      to: temporary,
      kind: "temporary",
    });
    positions.set(row.id, temporary);
  }
  return { rows, steps };
}

/** Resolve duplicates only. No locker assignment and no move of healthy cameras. */
export function conflictSchedule(
  cameras: Camera[],
  occupied: Set<string>,
  own: string[],
  serialTargets: Set<string>,
  candidates: string[],
  allowed: (id: string, ip: string) => boolean = () => true,
): { rows: AddressRow[]; steps: AddressStep[] } {
  const groups = new Map<string, Camera[]>();
  for (const camera of cameras) {
    const group = groups.get(camera.ip) ?? [];
    group.push(camera);
    groups.set(camera.ip, group);
  }
  const reserved = new Set([...occupied, ...own, ...cameras.map((c) => c.ip)]);
  const rows: AddressRow[] = [],
    steps: AddressStep[] = [];
  for (const [ip, group] of [...groups].sort(
    ([a], [b]) => ipNumber(a) - ipNumber(b),
  )) {
    if (group.length < 2 && !group.some((c) => c.ambiguous)) continue;
    group.sort((a, b) =>
      (a.mac || a.endpoint || a.id).localeCompare(b.mac || b.endpoint || b.id),
    );
    const identified = group.every((c) => serialTargets.has(c.id));
    const free = [...new Set(candidates)].filter(
      (ip) => !reserved.has(ip) && group.every((c) => allowed(c.id, ip)),
    );
    const enough = free.length >= group.length - 1;
    const ready = identified && enough;
    const groupRows = group.map((c, i): AddressRow => ({
      id: c.id,
      name: c.name || c.model || "Caméra",
      identity: c.mac || c.serial || c.endpoint || c.id,
      from: ip,
      to: ready && i > 0 ? free[i - 1] : ip,
      state: ready ? "ready" : "blocked",
      ...(serialTargets.has(c.id) ? { resolution: "serial" as const } : {}),
      message: !identified
        ? "Identification de toutes les caméras à cette IP non confirmée. Relancez l’analyse ; aucune modification de ce groupe."
        : !enough
          ? "Pas assez d’IP libres vérifiables. Aucune modification de ce groupe."
          : i === 0
            ? "Conserve son IP ; son identité sera vérifiée après séparation du doublon."
            : "Reçoit une IP libre, sans débrancher les caméras.",
    }));
    rows.push(...groupRows);
    if (!ready) continue;
    // Move peers first, then verify the retained address without writing to it.
    for (const row of groupRows.slice(1)) {
      reserved.add(row.to);
      steps.push({ id: row.id, from: row.from, to: row.to, kind: "final" });
    }
    steps.push({ id: groupRows[0].id, from: ip, to: ip, kind: "verify" });
  }
  return { rows, steps };
}
