import { z } from "zod";
import type { Camera } from "./types";

const lockerSchema = z
  .object({
    number: z.number().int().min(0).max(244),
    kind: z.enum(["IHM", "S", "M", "L", "XL", "XXL", "O", "P"]),
    column: z.number().int().min(0).max(128),
    zone: z.number().int().min(0).max(256),
    ports: z.string().max(128),
    ip: z.union([z.ipv4(), z.literal("")]),
  })
  .strict();
export const boxSchema = z
  .object({
    name: z.string().min(1).max(160),
    nameOrigin: z.enum(["manual", "file", "fallback"]).optional(),
    metadata: z
      .object({
        id: z.string().trim().max(80).optional(),
        address: z.string().max(2000).optional(),
        embedded: z.boolean().optional(),
        rearClosure: z.boolean().optional(),
        seaAir: z.boolean().optional(),
        sticker: z.boolean().optional(),
        siteVisit: z.boolean().optional(),
        format: z.string().max(160).optional(),
        columnCount: z.number().int().min(0).max(128).optional(),
        moduleCount: z.number().int().min(0).max(128).optional(),
        lockerCount: z.number().int().min(0).max(244).optional(),
        departureWeek: z.string().max(160).optional(),
        color1: z.string().max(500).optional(),
        color2: z.string().max(500).optional(),
        notes: z.string().max(5000).optional(),
        southcoModules: z
          .array(z.number().int().min(1).max(128))
          .max(128)
          .optional(),
        extra: z
          .array(
            z
              .object({
                label: z.string().max(200),
                value: z.string().max(5000),
              })
              .strict(),
          )
          .max(100)
          .optional(),
      })
      .strict()
      .optional(),
    source: z
      .object({ filename: z.string().min(1).max(255) })
      .strict()
      .optional(),
    importWarnings: z.array(z.string().max(1000)).max(100).optional(),
    lockers: z.array(lockerSchema).min(2).max(245),
  })
  .strict()
  .superRefine((box, ctx) => {
    const numbers = box.lockers.map((l) => l.number);
    if (new Set(numbers).size !== numbers.length)
      ctx.addIssue({ code: "custom", message: "Numéro de casier en double." });
    if (
      box.lockers.filter((l) => l.kind === "IHM").length !== 1 ||
      box.lockers.some(
        (l) =>
          (l.kind === "IHM") !== (l.number === 0) ||
          (l.kind === "IHM" && l.ip !== "0.0.0.0"),
      )
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Une seule IHM est requise : casier 0, IP 0.0.0.0, sans caméra.",
      });
  });
export type BoxDefinition = z.infer<typeof boxSchema>;
export type BoxLocker = BoxDefinition["lockers"][number];
export type BoxBindings = Record<string, string>;
export const lockerAddress = (number: number) => `192.168.1.${number + 10}`;

/** Only the Box ID is authoritative; a filename is a fallback for legacy imports. */
export function sameBox(current: BoxDefinition, incoming: BoxDefinition) {
  const a = current.metadata?.id?.trim(),
    b = incoming.metadata?.id?.trim();
  if (a && b) return a === b;
  const filename = incoming.source?.filename;
  if (!filename) return false;
  return (
    current.source?.filename === filename ||
    (!current.source && current.name === filename.replace(/\.[^.]+$/, ""))
  );
}
export function reconcileBox(
  current: BoxDefinition | undefined,
  incoming: BoxDefinition,
  bindings: BoxBindings,
  editing = false,
) {
  const updating = !!current && (editing || sameBox(current, incoming));
  const box = boxSchema.parse(
    updating
      ? {
          ...incoming,
          metadata: { ...current.metadata, ...incoming.metadata },
          ...(incoming.nameOrigin === "fallback" &&
          current.nameOrigin === "manual"
            ? { name: current.name, nameOrigin: "manual" }
            : {}),
        }
      : incoming,
  );
  const retained = updating
    ? Object.fromEntries(
        box.lockers
          .filter(
            (l) =>
              l.number > 0 &&
              current.lockers.some((old) => old.number === l.number),
          )
          .flatMap((l) =>
            bindings[String(l.number)]
              ? [[String(l.number), bindings[String(l.number)]]]
              : [],
          ),
      )
    : {};
  return { box, bindings: retained, updating };
}

/** Read wiring as data only. Quasar never drives a Southco lock. */
export function southcoPorts(value: string) {
  if (!value.trim()) return [];
  const items = value.split(/[,;\n]+/).map((v) => v.trim());
  if (items.some((v) => !/^\d{1,3}\s*:\s*\d{1,3}$/.test(v))) return undefined;
  const ports = items.map((v) => {
    const [module, port] = v.split(":").map(Number);
    return { module, port };
  });
  return ports.every((p) => p.module > 0 && p.port > 0) ? ports : undefined;
}
export function boxWarnings(box: BoxDefinition) {
  const warnings = [...(box.importWarnings ?? [])];
  const used = new Map<string, number>();
  const modules = new Set<number>();
  for (const locker of box.lockers) {
    const ports = southcoPorts(locker.ports);
    if (!ports && locker.ports)
      warnings.push(
        `Casier ${locker.number} : ports Southco non reconnus (${locker.ports}).`,
      );
    for (const p of ports ?? []) {
      modules.add(p.module);
      const key = `${p.module}:${p.port}`;
      if (used.has(key))
        warnings.push(
          `Port Southco ${key} utilisé par les casiers ${used.get(key)} et ${locker.number}.`,
        );
      used.set(key, locker.number);
    }
  }
  const declared = box.metadata?.southcoModules;
  const missing = [...modules].filter((m) => declared && !declared.includes(m));
  if (missing.length)
    warnings.push(
      `Le câblage utilise ${missing.length > 1 ? "les modules Southco" : "le module Southco"} ${missing.join(", ")}, absent(s) de Config. Les ports de Back office sont conservés.`,
    );
  if (
    box.metadata?.lockerCount !== undefined &&
    box.metadata.lockerCount !== box.lockers.length - 1
  )
    warnings.push(
      `Infos Box annonce ${box.metadata.lockerCount} casiers ; le plan en contient ${box.lockers.length - 1} hors IHM.`,
    );
  return [...new Set(warnings)];
}
export function cameraKey(camera: Camera) {
  return camera.endpoint
    ? `endpoint:${camera.endpoint.toLowerCase()}`
    : camera.mac
      ? `mac:${camera.mac.toLowerCase()}`
      : `session:${camera.id}`;
}
export function lockerCamera(
  locker: BoxLocker,
  cameras: Camera[],
  bindings: BoxBindings,
) {
  if (!locker.number) return undefined;
  const key = bindings[String(locker.number)];
  if (key) {
    const matches = cameras.filter((c) => cameraKey(c) === key);
    return matches.length === 1 ? matches[0] : undefined;
  }
  // Prefer the casier + 10 address even for manual or outdated production files.
  // A duplicate at that address must never fall back to a different camera.
  const expected = cameras.filter((c) => c.ip === lockerAddress(locker.number));
  const matches = expected.length
    ? expected
    : cameras.filter((c) => !!locker.ip && c.ip === locker.ip);
  return matches.length === 1 && !matches[0].ambiguous ? matches[0] : undefined;
}
export function boxAssignments(
  box: BoxDefinition,
  cameras: Camera[],
  bindings: BoxBindings,
) {
  const validated = boxSchema.parse(box);
  const assignments = validated.lockers
    .filter((l) => l.number > 0)
    .map((locker) => {
      const camera = lockerCamera(locker, cameras, bindings);
      if (!camera)
        throw Error(
          `Casier ${locker.number} : associez une caméra détectée avant d’attribuer les IP.`,
        );
      return { id: camera.id, locker: locker.number };
    });
  if (new Set(assignments.map((a) => a.id)).size !== assignments.length)
    throw Error(
      "Une même caméra est associée à plusieurs casiers. Corrigez les associations.",
    );
  return assignments.sort((a, b) => a.locker - b.locker);
}
export function parseBoxRows(rows: unknown[][], name: string): BoxDefinition {
  const headers = ["Casier", "N°", "Colonne", "Zone", "Ports", "IP"];
  if (
    !rows[0] ||
    headers.some(
      (h, i) =>
        String(rows[0][i] ?? "")
          .trim()
          .toLowerCase() !== h.toLowerCase(),
    )
  )
    throw Error("Colonnes attendues : Casier, N°, Colonne, Zone, Ports, IP.");
  const lockers = rows.slice(1).flatMap((row, index) => {
    const values = headers.map((_, i) => String(row[i] ?? "").trim());
    if (values.every((v) => !v)) return [];
    if (values.some((v) => !v))
      throw Error(
        `Ligne ${index + 2} : les six colonnes doivent être renseignées.`,
      );
    if ([1, 2, 3].some((i) => !/^\d+$/.test(values[i])))
      throw Error(
        `Ligne ${index + 2} : numéro, colonne et zone doivent être des entiers positifs ou nuls.`,
      );
    const result = lockerSchema.safeParse({
      kind: values[0],
      number: Number(values[1]),
      column: Number(values[2]),
      zone: Number(values[3]),
      ports: values[4],
      ip: values[5],
    });
    if (!result.success)
      throw Error(
        `Ligne ${index + 2} : ${result.error.issues.map((i) => `${i.path.join(".")} — ${i.message}`).join(" ; ")}`,
      );
    return [result.data];
  });
  const result = boxSchema.safeParse({ name, lockers });
  if (!result.success)
    throw Error(result.error.issues.map((i) => i.message).join(" "));
  return result.data;
}

// Same geometry as Logistics / BoxLayout: two tracks per column; P in pairs,
// XL across two columns; zones then local numbers define the vertical order.
export function placeBoxLockers(lockers: BoxLocker[]) {
  const rowSpan = { S: 1, M: 2, L: 4, XL: 4, XXL: 6, O: 4, P: 6, IHM: 4 };
  const columnSpan = { S: 2, M: 2, L: 2, XL: 4, XXL: 2, O: 2, P: 1, IHM: 2 };
  const columns = [...new Set(lockers.map((l) => l.column))].sort(
    (a, b) => a - b,
  );
  let maxColumn = 0,
    maxRow = 0;
  const placements = columns.flatMap((column, pair) => {
    let row = 1;
    let half: { row: number; span: number } | undefined;
    return lockers
      .filter((l) => l.column === column)
      .sort((a, b) => a.zone - b.zone || a.number - b.number)
      .map((locker) => {
        const width = columnSpan[locker.kind],
          height = rowSpan[locker.kind];
        const shares = width === 1 && half?.span === height;
        const rowStart = shares && half ? half.row : row;
        const columnStart = pair * 2 + 1 + (shares ? 1 : 0);
        maxColumn = Math.max(maxColumn, columnStart + width - 1);
        maxRow = Math.max(maxRow, rowStart + height - 1);
        // Reserve a band's height even if the last P has no partner.
        row = rowStart + height;
        half =
          width === 1 && !shares ? { row: rowStart, span: height } : undefined;
        return {
          locker,
          rowStart,
          columnStart,
          rowSpan: height,
          columnSpan: width,
        };
      });
  });
  return { columns: maxColumn, rows: maxRow, placements };
}
