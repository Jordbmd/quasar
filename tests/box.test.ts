import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import {
  parseBoxRows,
  placeBoxLockers,
  boxAssignments,
  lockerCamera,
  cameraKey,
  boxWarnings,
  reconcileBox,
  sameBox,
  boxSchema,
} from "../src/shared/box";
import { decodeBoxFile } from "../src/renderer/box-import";
import { addressRows } from "../src/main/addressing";
import { schemas } from "../src/shared/ipc-schemas";
import type { Camera } from "../src/shared/types";
const rows = [
  ["Casier", "N°", "Colonne", "Zone", "Ports", "IP"],
  ["IHM", 0, 1, 1, "0", "0.0.0.0"],
  ["S", 1, 1, 2, "1", "192.168.1.91"],
  ["M", 7, 2, 1, "2", "192.168.1.90"],
];
const box = () => parseBoxRows(rows, "Box test");
const cameras: Camera[] = [91, 90].map((n) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  ip: `192.168.1.${n}`,
  port: 80,
  path: "/onvif/device_service",
  status: "Connectée",
  ambiguous: false,
  mac: `02:00:00:00:00:${n}`,
  endpoint: `urn:uuid:camera-${n}`,
}));
describe("Import de casiers compatible backoffice", () => {
  it.each(["xlsx", "xls", "ods", "csv"] as const)(
    "lit le fichier %s et conserve la position et les numéros non consécutifs",
    (format) => {
      const book = utils.book_new();
      utils.book_append_sheet(book, utils.aoa_to_sheet(rows), "Back office");
      const bytes = write(book, { type: "array", bookType: format });
      expect(decodeBoxFile(bytes, `Box test.${format}`)).toMatchObject(box());
    },
  );
  it("refuse feuille manquante, formules et fichiers trop grands", () => {
    const book = utils.book_new();
    const sheet = utils.aoa_to_sheet(rows);
    utils.book_append_sheet(book, sheet, "Autre");
    expect(() =>
      decodeBoxFile(
        write(book, { type: "array", bookType: "xlsx" }),
        "box.xlsx",
      ),
    ).toThrow("Back office");
    book.SheetNames[0] = "Back office";
    book.Sheets["Back office"] = sheet;
    sheet.B3 = { t: "n", v: 1, f: "1+0" };
    expect(() =>
      decodeBoxFile(
        write(book, { type: "array", bookType: "xlsx" }),
        "box.xlsx",
      ),
    ).toThrow("formules");
    expect(() =>
      decodeBoxFile(new ArrayBuffer(6 * 1024 * 1024), "box.xlsx"),
    ).toThrow("5 Mo");
  });
  it("refuse numéro dupliqué, IHM incorrecte, champs absents et numéro hors plage IPv4", () => {
    expect(() => parseBoxRows([...rows, rows[2]], "Box")).toThrow("double");
    expect(() => parseBoxRows([rows[0], rows[2]], "Box")).toThrow("IHM");
    expect(() =>
      parseBoxRows(
        [rows[0], ["S", 0, 1, 1, 1, "192.168.1.10"], rows[3]],
        "Box",
      ),
    ).toThrow("IHM");
    expect(() =>
      parseBoxRows(
        [rows[0], rows[1], ["S", 245, 1, 1, 1, "192.168.1.11"]],
        "Box",
      ),
    ).toThrow("Ligne 3");
    expect(() =>
      parseBoxRows(
        [rows[0], rows[1], ["S", 1, "", 1, 1, "192.168.1.11"]],
        "Box",
      ),
    ).toThrow("six colonnes");
  });
});
it("conserve les proportions Logistics, le tri des zones et les paires de P", () => {
  const p = { ...box().lockers[2], kind: "P" as const };
  const layout = placeBoxLockers([
    p,
    { ...p, number: 8 },
    { ...p, number: 9, kind: "S" },
  ]);
  expect(
    layout.placements.map((p) => [
      p.rowStart,
      p.columnStart,
      p.rowSpan,
      p.columnSpan,
    ]),
  ).toEqual([
    [1, 1, 6, 1],
    [1, 2, 6, 1],
    [7, 1, 1, 2],
  ]);
  const unpaired = placeBoxLockers([p, { ...p, number: 8, kind: "S" }]);
  expect(unpaired.placements[1].rowStart).toBe(7);
});
it("une association persistée suit l’identité après changement d’IP, sans rebondir sur une remplaçante", () => {
  const bindings = { "1": cameraKey(cameras[0]) };
  const moved = { ...cameras[0], ip: "192.168.1.11" };
  expect(lockerCamera(box().lockers[1], [moved], bindings)).toBe(moved);
  expect(
    lockerCamera(
      box().lockers[1],
      [{ ...cameras[0], endpoint: "other" }],
      bindings,
    ),
  ).toBeUndefined();
  expect(lockerCamera(box().lockers[0], cameras, bindings)).toBeUndefined();
});
it("ne déduit jamais une association d’une IP en conflit ou d’une caméra utilisée deux fois", () => {
  expect(() =>
    boxAssignments(
      box(),
      [cameras[0], { ...cameras[1], ip: cameras[0].ip }],
      {},
    ),
  ).toThrow("associez");
  expect(() =>
    boxAssignments(box(), cameras, {
      "1": cameraKey(cameras[0]),
      "7": cameraKey(cameras[0]),
    }),
  ).toThrow("plusieurs");
});
it("adresse les caméras selon les vrais numéros et conserve les contrôles des caméras hors Box", () => {
  const assignments = boxAssignments(box(), cameras, {});
  const plan = addressRows(cameras, 1, new Set(), [], new Set(), assignments);
  expect(plan.map((r) => [r.from, r.to, r.locker])).toEqual([
    ["192.168.1.91", "192.168.1.11", 1],
    ["192.168.1.90", "192.168.1.17", 7],
  ]);
  const occupied = { ...cameras[0], id: "other", ip: "192.168.1.17" };
  expect(
    addressRows(
      [...cameras, occupied],
      1,
      new Set(),
      [],
      new Set(),
      assignments,
    )[1].state,
  ).toBe("blocked");
  expect(() =>
    addressRows(cameras, 1, new Set(), [], new Set(), [
      { id: cameras[0].id, locker: 0 },
    ]),
  ).toThrow("IHM");
  expect(() =>
    addressRows(cameras, 1, new Set(), [], new Set(), [
      { id: "missing", locker: 1 },
    ]),
  ).toThrow("invalides");
});
it("valide les associations à la frontière IPC, sans accepter l’IHM ni les doublons", () => {
  const assignments = boxAssignments(box(), cameras, {});
  expect(
    schemas.previewAddresses.safeParse({ start: 1, assignments }).success,
  ).toBe(true);
  for (const invalid of [
    [{ id: cameras[0].id, locker: 0 }],
    [assignments[0], assignments[0]],
    [
      { id: cameras[0].id, locker: 1 },
      { id: cameras[1].id, locker: 1 },
    ],
  ])
    expect(
      schemas.previewAddresses.safeParse({ start: 1, assignments: invalid })
        .success,
    ).toBe(false);
});
it("lit les CSV UTF-8 sans BOM et les CSV Windows avec séparateur point-virgule", () => {
  const csv = rows.map((r) => r.join(";")).join("\n");
  const utf8 = new TextEncoder().encode(csv).buffer;
  expect(decodeBoxFile(utf8, "Box test.csv")).toMatchObject(box());
  const latin = Uint8Array.from(csv, (c) => c.charCodeAt(0)).buffer;
  expect(decodeBoxFile(latin, "Box test.csv")).toMatchObject(box());
});

function productionBook(id = 140) {
  const book = utils.book_new();
  utils.book_append_sheet(
    book,
    utils.aoa_to_sheet([
      rows[0],
      ["IHM", 0, 1, 1, "1:14,2:14", "0.0.0.0"],
      ["M", 1, 2, 2, "3:1", "192.168.1.11"],
    ]),
    "Back office",
  );
  utils.book_append_sheet(
    book,
    utils.aoa_to_sheet([
      ["ID Box", id],
      ["Nombre colonne(s)", 2],
      ["Nombre module(s)", 1],
      ["Nombre de casier(s) (hors IHM)", 1],
      ["Adresse finale destination", "Site test\n10 rue de test"],
      ["Encastrée", "Non"],
      ["Fermeture arrière", "Oui"],
      ["Format", 1960],
      ["Point d'attention ", "Câblage à vérifier"],
      ["Option future", "Valeur conservée"],
    ]),
    "Infos Box",
  );
  utils.book_append_sheet(
    book,
    utils.aoa_to_sheet([
      ["ID de la box", id],
      ["Encastré", "NON"],
      ["SouthCo_1", 1],
      ["SouthCo_2", 1],
      ["SouthCo_3", 0],
    ]),
    "Config",
  );
  return book;
}
const decodeProduction = (
  book = productionBook(),
  filename = "Production.xlsx",
) => decodeBoxFile(write(book, { type: "array", bookType: "xlsx" }), filename);
it("importe les informations de production et conserve le câblage corrigé plutôt que Config", () => {
  const actual = decodeProduction();
  expect(actual.name).toBe("Box 140");
  expect(actual.metadata).toMatchObject({
    id: "140",
    address: "Site test\n10 rue de test",
    embedded: false,
    rearClosure: true,
    format: "1960",
    southcoModules: [1, 2],
    columnCount: 2,
    moduleCount: 1,
    lockerCount: 1,
  });
  expect(actual.metadata?.extra).toContainEqual({
    label: "Option future",
    value: "Valeur conservée",
  });
  expect(actual.lockers[1].ports).toBe("3:1");
  expect(boxWarnings(actual)).toEqual([
    expect.stringContaining("Southco absents de Config : 3"),
  ]);
});
it("détecte les divergences de câblage, ports partagés et nombres de casiers", () => {
  const book = productionBook();
  utils.book_append_sheet(
    book,
    utils.aoa_to_sheet([["M1\n1:9"], ["M1\n1:9"]]),
    "Plan de cablage",
  );
  const result = decodeProduction(book);
  expect(result.importWarnings).toHaveLength(1);
  expect(result.lockers[1].ports).toBe("3:1");
  result.lockers[1].ports = "1:14";
  result.metadata!.lockerCount = 10;
  expect(boxWarnings(result)).toEqual(
    expect.arrayContaining([
      expect.stringContaining("Port Southco 1:14"),
      expect.stringContaining("annonce 10 casiers"),
    ]),
  );
});
it("refuse une identité Box incohérente et signale les options contradictoires", () => {
  const book = productionBook();
  book.Sheets.Config.A1.v = "ID de la box";
  book.Sheets.Config.B1.v = 141;
  expect(() => decodeProduction(book)).toThrow("ID de Box");
  book.Sheets.Config.B1.v = 140;
  book.Sheets.Config.B2.v = "OUI";
  const actual = decodeProduction(book);
  expect(actual.metadata?.embedded).toBe(false);
  expect(actual.importWarnings).toEqual([expect.stringContaining("diffèrent")]);
});
it("met à jour par ID malgré un nouveau nom de fichier, sans perdre les associations restantes ni le nom personnalisé", () => {
  const before = {
    ...decodeProduction(),
    name: "Box atelier",
    nameOrigin: "manual" as const,
  };
  before.lockers.push({ ...before.lockers[1], number: 7, ports: "1:7" });
  const incoming = decodeProduction(productionBook(), "Nouvelle version.xlsx");
  incoming.metadata!.address = "Adresse corrigée";
  incoming.lockers.push({ ...incoming.lockers[1], number: 8, ports: "1:8" });
  const next = reconcileBox(before, incoming, {
    "1": "endpoint:camera-1",
    "7": "endpoint:camera-7",
  });
  expect(next.updating).toBe(true);
  expect(next.box.name).toBe("Box atelier");
  expect(next.box.metadata?.address).toBe("Adresse corrigée");
  expect(next.bindings).toEqual({ "1": "endpoint:camera-1" });
  expect(next.box.lockers.map((l) => l.number)).toEqual([0, 1, 8]);
  const twice = reconcileBox(next.box, incoming, next.bindings);
  expect(twice).toEqual(next);
});
it("ne fusionne pas deux Box différentes, même avec le même nom de fichier", () => {
  const before = decodeProduction();
  const incoming = decodeProduction(productionBook(141));
  expect(sameBox(before, incoming)).toBe(false);
  expect(
    reconcileBox(before, incoming, { "1": "endpoint:camera-1" }),
  ).toMatchObject({
    updating: false,
    bindings: {},
    box: { metadata: { id: "141" } },
  });
});
it("reprend un ancien import sans métadonnées et accepte une fiche manuelle avec ports ou IP inconnus", () => {
  const before = parseBoxRows(rows, "Box test");
  const incoming = decodeProduction(productionBook(), "Box test.xlsx");
  expect(sameBox(before, incoming)).toBe(true);
  expect(
    reconcileBox(before, incoming, { "1": "endpoint:camera-1" }).bindings,
  ).toEqual({ "1": "endpoint:camera-1" });
  const manual = {
    name: "Ancienne Box",
    lockers: box().lockers.map((l) => ({
      ...l,
      ports: "",
      ip: l.number ? "" : "0.0.0.0",
    })),
  };
  expect(boxSchema.safeParse(manual).success).toBe(true);
  expect(() => boxAssignments(manual, cameras, {})).toThrow("associez");
  expect(
    boxSchema.safeParse({
      ...manual,
      lockers: manual.lockers.filter((l) => l.number),
    }).success,
  ).toBe(false);
});
it("préserve les informations manuelles absentes d’un import de casiers seul", () => {
  const before = {
    ...decodeProduction(),
    name: "Atelier",
    nameOrigin: "manual" as const,
  };
  const incoming = {
    ...box(),
    source: { filename: "Production.xlsx" },
    nameOrigin: "fallback" as const,
  };
  const next = reconcileBox(before, incoming, {});
  expect(next.box.metadata?.address).toBe(before.metadata?.address);
  expect(next.box.name).toBe("Atelier");
});
it("efface une option volontairement vidée dans le fichier, sans garder l’ancienne valeur", () => {
  const before = decodeProduction();
  const book = productionBook();
  book.Sheets["Infos Box"].B7 = { t: "s", v: "" };
  const incoming = decodeProduction(book);
  const next = reconcileBox(before, incoming, {});
  expect(before.metadata?.rearClosure).toBe(true);
  expect(next.box.metadata?.rearClosure).toBeUndefined();
});

it("associe automatiquement les IP casier + 10 même sans IP dans la fiche", () => {
  const locker = { ...box().lockers[1], ip: "" };
  const expected = { ...cameras[0], ip: "192.168.1.11" };
  expect(lockerCamera(locker, [expected], {})).toBe(expected);
  expect(
    lockerCamera({ ...locker, ip: "192.168.1.91" }, [cameras[0], expected], {}),
  ).toBe(expected);
});
it("refuse une IP attendue ambiguë sans basculer vers l’ancienne IP de la fiche", () => {
  const locker = box().lockers[1];
  const expected = { ...cameras[0], ip: "192.168.1.11", ambiguous: true };
  expect(lockerCamera(locker, [cameras[0], expected], {})).toBeUndefined();
  expect(
    lockerCamera(
      locker,
      [
        cameras[0],
        { ...expected, ambiguous: false },
        { ...cameras[1], ip: expected.ip },
      ],
      {},
    ),
  ).toBeUndefined();
});
it("respecte une association manuelle ou une désassociation explicite malgré une IP conforme", () => {
  const locker = box().lockers[1];
  const expected = { ...cameras[1], ip: "192.168.1.11" };
  expect(
    lockerCamera(locker, [cameras[0], expected], {
      "1": cameraKey(cameras[0]),
    }),
  ).toBe(cameras[0]);
  expect(
    lockerCamera(locker, [expected], { "1": "unassigned" }),
  ).toBeUndefined();
});
