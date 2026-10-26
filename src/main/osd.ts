import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OSDOptions, OSDValues } from "../shared/osd-options";
import type { Camera } from "../shared/types";
import { identityMatches } from "./discovery";

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: false,
});
const builder = new XMLBuilder({
  preserveOrder: true,
  ignoreAttributes: false,
});
export const local = (key: string) => key.split(":").at(-1)!;
export function parseXML(xml: string): any[] {
  if (
    xml.length > 2_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new Error("Réponse XML invalide ou trop volumineuse.");
  return parser.parse(xml);
}
export function nodes(
  tree: any[],
  name: string,
  inherited: Record<string, unknown> = {},
): any[] {
  return tree.flatMap((node) => {
    const key = Object.keys(node).find(
      (k) => k !== ":@" && !k.startsWith("#") && !k.startsWith("?"),
    );
    if (!key) return [];
    const ns = {
      ...inherited,
      ...Object.fromEntries(
        Object.entries(node[":@"] ?? {}).filter(([k]) =>
          k.startsWith("@_xmlns"),
        ),
      ),
    };
    if (local(key) === name)
      return [
        { key, children: node[key], attributes: { ...ns, ...node[":@"] } },
      ];
    return nodes(node[key], name, ns);
  });
}
export function textOf(tree: any[], name: string) {
  const item = nodes(tree, name)[0];
  return item ? item.children.map((x: any) => x["#text"] ?? "").join("") : "";
}
export type OSDObject = OSDValues & {
  token: string;
  source: string;
  type: string;
  text: string;
  position: string;
  xml: string;
  signature: string;
};
export function signature(xml: string): string {
  const normalize = (tree: any[], depth = 0): any =>
    tree.flatMap<any>((n) => {
      if (n["#text"] !== undefined)
        return String(n["#text"]).trim() ? [{ text: n["#text"] }] : [];
      const k = Object.keys(n).find((k) => k !== ":@");
      if (!k) return [];
      const attrs = Object.fromEntries(
        Object.entries(n[":@"] ?? {})
          .filter(
            ([a]) =>
              !a.startsWith("@_xmlns") && !(depth === 0 && a === "@_token"),
          )
          .sort(),
      );
      return [
        {
          name: local(k) === "OSDs" ? "OSD" : local(k),
          attrs,
          children: normalize(n[k], depth + 1),
        },
      ];
    });
  return JSON.stringify(normalize(parseXML(xml)));
}
export function parseOSDs(xml: string): OSDObject[] {
  const tree = parseXML(xml);
  if (!nodes(tree, "GetOSDsResponse").length)
    throw new Error("Réponse GetOSDs absente.");
  const objects = nodes(tree, "OSDs").map((n) => {
    const serialized = builder.build([
      { [n.key]: n.children, ":@": n.attributes },
    ]);
    const text = nodes(n.children, "TextString")[0]?.children ?? [];
    const position = nodes(n.children, "Position")[0]?.children ?? [];
    const pos = nodes(position, "Pos")[0]?.attributes;
    return {
      textType: textOf(text, "Type") as OSDValues["textType"],
      dateFormat: textOf(text, "DateFormat"),
      timeFormat: textOf(text, "TimeFormat"),
      fontSize:
        textOf(text, "FontSize") === ""
          ? undefined
          : Number(textOf(text, "FontSize")),
      x: pos?.["@_x"] === undefined ? undefined : Number(pos["@_x"]),
      y: pos?.["@_y"] === undefined ? undefined : Number(pos["@_y"]),
      token: String(n.attributes["@_token"] ?? ""),
      source: textOf(n.children, "VideoSourceConfigurationToken"),
      type: textOf(n.children, "Type"),
      text: textOf(n.children, "PlainText"),
      position: textOf(
        nodes(n.children, "Position")[0]?.children ?? [],
        "Type",
      ),
      xml: serialized,
      signature: signature(serialized),
    };
  });
  if (
    objects.length > 64 ||
    objects.some((o) => !o.token) ||
    new Set(objects.map((o) => o.token)).size !== objects.length
  )
    throw new Error("Objets OSD trop nombreux ou identifiants ambigus.");
  return objects;
}
export function osdPayload(
  osd: OSDObject,
  namespace: string,
  create = false,
  changes?: string | OSDValues,
) {
  const parsed = parseXML(osd.xml);
  const root = parsed[0];
  const oldKey = Object.keys(root).find((k) => k !== ":@")!;
  const children = root[oldKey];
  const values =
    typeof changes === "string" ? { text: changes } : (changes ?? {});
  const replace = (
    tree: any[],
    name: string,
    value: string | number,
    order: string[],
  ) => {
    let field = nodes(tree, name)[0];
    if (field)
      field.children.splice(0, field.children.length, {
        "#text": String(value),
      });
    else {
      const index = tree.findIndex(
        (n) => order.indexOf(local(Object.keys(n)[0])) > order.indexOf(name),
      );
      tree.splice(index < 0 ? tree.length : index, 0, {
        ["tt:" + name]: [{ "#text": String(value) }],
      });
    }
  };
  const text = nodes(children, "TextString")[0]?.children;
  const order = [
    "Type",
    "DateFormat",
    "TimeFormat",
    "FontSize",
    "FontColor",
    "BackgroundColor",
    "PlainText",
    "Extension",
  ];
  for (const [key, tag] of Object.entries({
    text: "PlainText",
    textType: "Type",
    dateFormat: "DateFormat",
    timeFormat: "TimeFormat",
    fontSize: "FontSize",
  })) {
    const value = values[key as keyof OSDValues];
    if (value !== undefined) {
      if (!text)
        throw new Error("Cette incrustation n’est pas un texte modifiable.");
      replace(text, tag, value, order);
    }
  }
  const position = nodes(children, "Position")[0]?.children;
  if (values.position !== undefined) {
    if (!position) throw new Error("Position OSD absente.");
    replace(position, "Type", values.position, ["Type", "Pos", "Extension"]);
  }
  if (values.x !== undefined || values.y !== undefined) {
    if (!position) throw new Error("Position OSD absente.");
    let node = position.find((n: any) =>
      Object.keys(n).some((k) => local(k) === "Pos"),
    );
    if (!node) {
      node = { "tt:Pos": [], ":@": {} };
      position.push(node);
    }
    node[":@"] = {
      ...node[":@"],
      ...(values.x !== undefined ? { "@_x": String(values.x) } : {}),
      ...(values.y !== undefined ? { "@_y": String(values.y) } : {}),
    };
  }
  const attrs = {
    ...root[":@"],
    "@_xmlns:sz": namespace,
    "@_xmlns:tt": "http://www.onvif.org/ver10/schema",
    "@_token": create ? "" : osd.token,
  };
  return builder.build([{ "sz:OSD": children, ":@": attrs }]);
}
export type OSDSnapshot = {
  version: 1;
  at: string;
  camera: Camera;
  objects: OSDObject[];
};
export class OSDStore {
  constructor(private dir: string) {}
  private file(c: Camera) {
    const key = createHash("sha256")
      .update(JSON.stringify([c.manufacturer, c.model, c.serial, c.mac]))
      .digest("hex");
    return path.join(this.dir, `${key}.json`);
  }
  async read(c: Camera): Promise<OSDSnapshot | undefined> {
    try {
      const s = JSON.parse(await readFile(this.file(c), "utf8")) as OSDSnapshot;
      if (
        s.version !== 1 ||
        !identityMatches(c, s.camera) ||
        !Array.isArray(s.objects) ||
        s.objects.length > 64
      )
        return;
      for (const o of s.objects) if (signature(o.xml) !== o.signature) return;
      return s;
    } catch {
      return;
    }
  }
  async save(c: Camera, objects: OSDObject[], replace = false) {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const previous = replace ? undefined : await this.read(c);
    const combined = [...(previous?.objects ?? [])];
    for (const o of objects)
      if (!combined.some((p) => p.token === o.token)) combined.push(o);
    if (combined.length > 64)
      throw new Error(
        "La sauvegarde OSD dépasse 64 objets. Aucune suppression envoyée.",
      );
    const data: OSDSnapshot = {
      version: 1,
      at: new Date().toISOString(),
      camera: { ...c },
      objects: combined,
    };
    await writeFile(this.file(c), JSON.stringify(data, null, 2), {
      mode: 0o600,
    });
  }
}

export function parseOSDOptions(xml: string): OSDOptions {
  const tree = parseXML(xml);
  if (!nodes(tree, "GetOSDOptionsResponse").length)
    throw new Error("Réponse GetOSDOptions absente.");
  const root = nodes(tree, "OSDOptions")[0]?.children ?? [];
  const text = nodes(root, "TextOption")[0]?.children ?? [];
  const values = (tree: any[], name: string) =>
    nodes(tree, name).map((n) =>
      n.children.map((x: any) => x["#text"] ?? "").join(""),
    );
  const maximum = nodes(root, "MaximumNumberOfOSDs")[0]?.attributes ?? {};
  const range = nodes(text, "FontSizeRange")[0]?.children;
  return {
    types: root.flatMap((n: any) =>
      Object.keys(n)
        .filter((k) => local(k) === "Type")
        .map((k) => n[k].map((v: any) => v["#text"] ?? "").join("")),
    ),
    positions: values(root, "PositionOption"),
    textTypes: values(text, "Type"),
    dateFormats: values(text, "DateFormat"),
    timeFormats: values(text, "TimeFormat"),
    fontSize: range
      ? { min: Number(textOf(range, "Min")), max: Number(textOf(range, "Max")) }
      : undefined,
    maximum: Object.fromEntries(
      Object.entries(maximum)
        .filter(
          ([k, v]) => !k.startsWith("@_xmlns") && Number.isFinite(Number(v)),
        )
        .map(([k, v]) => [k.replace("@_", ""), Number(v)]),
    ),
  };
}
export function validateOSD(
  values: OSDValues,
  options: OSDOptions,
  creating = false,
) {
  const check = (
    value: string | undefined,
    choices: string[],
    name: string,
  ) => {
    if (value !== undefined && !choices.includes(value))
      throw new Error(`${name} OSD non pris en charge.`);
  };
  if (
    creating &&
    (!options.types.includes("Text") || !values.textType || !values.position)
  )
    throw new Error("Création OSD non disponible pour cette source.");
  check(values.textType, options.textTypes, "Type");
  check(values.position, options.positions, "Position");
  check(values.dateFormat, options.dateFormats, "Format de date");
  check(values.timeFormat, options.timeFormats, "Format d’heure");
  if (
    values.fontSize !== undefined &&
    (!options.fontSize ||
      values.fontSize < options.fontSize.min ||
      values.fontSize > options.fontSize.max)
  )
    throw new Error("Taille du texte OSD hors limites.");
  if (creating && values.textType === "Plain" && !values.text?.trim())
    throw new Error("Saisissez le texte à afficher.");
  if (
    creating &&
    values.position === "Custom" &&
    (values.x === undefined || values.y === undefined)
  )
    throw new Error("Coordonnées OSD nécessaires.");
}
export function newOSDPayload(
  source: string,
  values: OSDValues,
  namespace: string,
) {
  const xml = builder.build([
    {
      "sz:OSDs": [
        { "tt:VideoSourceConfigurationToken": [{ "#text": source }] },
        { "tt:Type": [{ "#text": "Text" }] },
        { "tt:Position": [{ "tt:Type": [{ "#text": values.position }] }] },
        { "tt:TextString": [{ "tt:Type": [{ "#text": values.textType }] }] },
      ],
      ":@": {
        "@_token": "",
        "@_xmlns:sz": namespace,
        "@_xmlns:tt": "http://www.onvif.org/ver10/schema",
      },
    },
  ]);
  return osdPayload(
    {
      token: "",
      source,
      type: "Text",
      text: "",
      position: values.position!,
      xml,
      signature: "",
    },
    namespace,
    true,
    values,
  );
}
