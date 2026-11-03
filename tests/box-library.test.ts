import { describe, it, expect } from "vitest";
import {
  readBoxLibrary,
  saveBoxLibrary,
  upsertBox,
  bindBox,
  BOX_LIBRARY_KEY,
  type BoxLibrary,
} from "../src/renderer/box-storage";
import { parseBoxRows } from "../src/shared/box";
const box = (id: string) => ({
  ...parseBoxRows(
    [
      ["Casier", "N°", "Colonne", "Zone", "Ports", "IP"],
      ["IHM", 0, 1, 1, "1:14", "0.0.0.0"],
      ["S", 1, 1, 2, "1:1", "192.168.1.11"],
    ],
    `Box ${id}`,
  ),
  metadata: { id, address: `Site ${id}` },
  source: { filename: `Production ${id}.xlsx` },
});
const empty: BoxLibrary = { version: 1, entries: [] };
const storage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};
describe("Bibliothèque de Box", () => {
  it("migre la Box installée sans modifier l’ancienne sauvegarde", () => {
    const legacy = JSON.stringify({
      box: box("140"),
      bindings: { "1": "endpoint:one" },
    });
    const disk = storage({ "quasar-installed-box": legacy });
    const result = readBoxLibrary(disk);
    expect(result.error).toBeUndefined();
    expect(result.library.entries[0].bindings).toEqual({ "1": "endpoint:one" });
    expect(disk.values.size).toBe(1);
    saveBoxLibrary(result.library, disk);
    expect(disk.getItem("quasar-installed-box")).toBe(legacy);
    expect(readBoxLibrary(disk)).toEqual(result);
  });
  it("conserve plusieurs Box et met à jour celle qui correspond à l’ID, même inactive", () => {
    const a = upsertBox(empty, box("140"));
    const bound = bindBox(a.library, a.entry.id, {
      "1": "endpoint:camera-140",
    });
    const b = upsertBox(bound, box("141"));
    expect(b.library.entries).toHaveLength(2);
    const updated = upsertBox(b.library, {
      ...box("140"),
      source: { filename: "Version finale.xlsx" },
      metadata: { id: "140", address: "Nouvelle adresse" },
    });
    expect(updated.entry.id).toBe(a.entry.id);
    expect(updated.entry.bindings).toEqual({ "1": "endpoint:camera-140" });
    expect(updated.library.entries.find((e) => e.id === b.entry.id)).toEqual(
      b.entry,
    );
    expect(updated.library.entries).toHaveLength(2);
  });
  it("isole les associations même quand les Box ont les mêmes numéros et IP", () => {
    const a = upsertBox(empty, box("140"));
    const b = upsertBox(a.library, box("141"));
    const library = bindBox(b.library, a.entry.id, { "1": "endpoint:one" });
    const second = bindBox(library, b.entry.id, { "1": "endpoint:two" });
    expect(second.entries.map((e) => e.bindings["1"])).toEqual([
      "endpoint:one",
      "endpoint:two",
    ]);
    const disk = storage();
    saveBoxLibrary({ ...second, activeId: a.entry.id }, disk);
    expect(readBoxLibrary(disk).library.activeId).toBe(a.entry.id);
  });
  it("refuse la collision d’ID pendant l’édition d’une autre fiche", () => {
    const a = upsertBox(empty, box("140"));
    const b = upsertBox(a.library, box("141"));
    expect(() => upsertBox(b.library, box("141"), a.entry.id)).toThrow("déjà");
    expect(b.library.entries.map((e) => e.box.metadata?.id)).toEqual([
      "140",
      "141",
    ]);
  });
  it("conserve les données illisibles au lieu de les remplacer par une bibliothèque vide", () => {
    const disk = storage({
      [BOX_LIBRARY_KEY]: "broken",
      "quasar-installed-box": JSON.stringify({ box: box("140"), bindings: {} }),
    });
    expect(readBoxLibrary(disk).error).toMatch(/conservées/);
    expect(disk.getItem(BOX_LIBRARY_KEY)).toBe("broken");
  });
  it("propage un refus d’écriture sans altérer l’ancien contenu", () => {
    const disk = storage();
    saveBoxLibrary(upsertBox(empty, box("140")).library, disk);
    const before = disk.getItem(BOX_LIBRARY_KEY);
    expect(() =>
      saveBoxLibrary(upsertBox(empty, box("141")).library, {
        ...disk,
        setItem: () => {
          throw Error("Quota");
        },
      }),
    ).toThrow("Quota");
    expect(disk.getItem(BOX_LIBRARY_KEY)).toBe(before);
  });
});
