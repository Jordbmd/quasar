import { t } from "../shared/i18n";
import { z } from "zod";
import {
  boxSchema,
  reconcileBox,
  sameBox,
  type BoxDefinition,
  type BoxBindings,
} from "../shared/box";
const bindingsSchema = z.record(
  z.string().regex(/^\d{1,3}$/),
  z.string().max(256),
);
const legacySchema = z
  .object({ box: boxSchema, bindings: bindingsSchema })
  .strict();
const recordSchema = legacySchema
  .extend({ id: z.string().min(1).max(80) })
  .strict();
const librarySchema = z
  .object({
    version: z.literal(1),
    entries: z.array(recordSchema).max(200),
    activeId: z.string().optional(),
  })
  .strict()
  .superRefine((library, ctx) => {
    if (
      new Set(library.entries.map((e) => e.id)).size !==
        library.entries.length ||
      (library.activeId &&
        !library.entries.some((e) => e.id === library.activeId))
    )
      ctx.addIssue({
        code: "custom",
        message: t("Bibliothèque de Box incohérente."),
      });
  });
type BoxRecord = z.infer<typeof recordSchema>;
export type BoxLibrary = z.infer<typeof librarySchema>;
export const BOX_LIBRARY_KEY = "quasar-box-library";
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
export function readBoxLibrary(storage: StorageAccess = localStorage): {
  library: BoxLibrary;
  error?: string;
} {
  const empty: BoxLibrary = { version: 1, entries: [] };
  try {
    const saved = storage.getItem(BOX_LIBRARY_KEY);
    if (saved !== null)
      return { library: librarySchema.parse(JSON.parse(saved)) };
    const legacy = storage.getItem("quasar-installed-box");
    if (!legacy) return { library: empty };
    const entry = {
      ...legacySchema.parse(JSON.parse(legacy)),
      id: "legacy-box",
    };
    // The legacy key remains untouched, including after the first library save.
    return { library: { version: 1, entries: [entry], activeId: entry.id } };
  } catch {
    return {
      library: empty,
      error: t(
        "La bibliothèque locale ne peut pas être lue. Les données sont conservées ; réparez ou restaurez la sauvegarde avant d’enregistrer de nouvelles Box.",
      ),
    };
  }
}
export function saveBoxLibrary(
  library: BoxLibrary,
  storage: StorageAccess = localStorage,
) {
  storage.setItem(
    BOX_LIBRARY_KEY,
    JSON.stringify(librarySchema.parse(library)),
  );
}
export function upsertBox(
  library: BoxLibrary,
  incoming: BoxDefinition,
  editingId?: string,
) {
  const exact = incoming.metadata?.id
    ? library.entries.filter(
        (e) => e.box.metadata?.id === incoming.metadata?.id,
      )
    : [];
  const candidates = exact.length
    ? exact
    : library.entries.filter((e) => sameBox(e.box, incoming));
  if (candidates.length > 1)
    throw Error(
      t(
        "Plusieurs Box correspondent à ce fichier. Renseignez une ID de Box unique avant de réimporter.",
      ),
    );
  const current = editingId
    ? library.entries.find((e) => e.id === editingId)
    : candidates[0];
  if (editingId && !current) throw Error(t("La Box à modifier n’existe plus."));
  if (editingId && exact.some((e) => e.id !== editingId))
    throw Error(
      t("Cette ID appartient déjà à une autre Box de la bibliothèque."),
    );
  const next = reconcileBox(
    current?.box,
    incoming,
    current?.bindings ?? {},
    !!current,
  );
  const entry: BoxRecord = {
    id: current?.id ?? crypto.randomUUID(),
    box: next.box,
    bindings: next.bindings,
  };
  const result = librarySchema.parse({
    version: 1,
    activeId: entry.id,
    entries: current
      ? library.entries.map((e) => (e.id === entry.id ? entry : e))
      : [...library.entries, entry],
  });
  return { library: result, entry, updating: !!current };
}
export function bindBox(
  library: BoxLibrary,
  id: string,
  bindings: BoxBindings,
) {
  if (!library.entries.some((e) => e.id === id))
    throw Error("Box introuvable.");
  return librarySchema.parse({
    ...library,
    entries: library.entries.map((e) => (e.id === id ? { ...e, bindings } : e)),
  });
}
