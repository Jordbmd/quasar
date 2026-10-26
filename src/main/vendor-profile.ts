import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";
import { createHash } from "node:crypto";
import {
  vendorGroups,
  vendorMappings,
  vendorFieldIds,
  type VendorGroup,
} from "../shared/vendor-profile";
import type { DefaultValue } from "../shared/defaults";
import type { Feature } from "../shared/types";
import type { CameraConnection } from "./onvif";
const parser = new XMLParser({
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
});
const builder = new XMLBuilder({ ignoreAttributes: false });
const array = (v: any): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
export type VendorSnapshot = {
  groups: Partial<Record<VendorGroup, Feature>>;
  videoOptions: any[];
};
export function parseVendorDocument(xml: string): any {
  if (
    xml.length > 1024 * 1024 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw Error("Réponse API web XML invalide.");
  const doc = parser.parse(xml);
  if (Object.keys(doc).filter((k) => !k.startsWith("?")).length !== 1)
    throw Error("Réponse API web ambiguë.");
  return doc;
}
export function extractVendorGroup(doc: any, group: VendorGroup): any {
  const spec = vendorGroups[group];
  const data = spec.section
    ? doc?.[spec.root]?.[spec.section]
    : doc?.[spec.root];
  if (group === "input" && typeof data === "string" && !data.trim())
    throw Error(
      "ActionNotSupported : la caméra ne fournit aucun canal d’entrée IO configurable.",
    );
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw Error("ActionNotSupported : bloc " + group + " absent ou ambigu.");
  const copy = structuredClone(data);
  if (group === "overlay" && doc.Video?.UserOverlay)
    copy.__userOverlay = structuredClone(doc.Video.UserOverlay);
  return copy;
}
export async function readVendorProfile(
  conn: CameraConnection,
): Promise<Feature> {
  const video = await conn.feature(async () =>
    parseVendorDocument(await conn.vendorRequest("/getMediaVideoConfig")),
  );
  if (video.state !== "available") return video;
  if (
    !video.data?.Video?.Capture ||
    !video.data?.Video?.Encode ||
    !video.data?.Video?.CodeList
  )
    return {
      state: "unsupported",
      message: "Protocole web non reconnu ; utilisation d’ONVIF.",
    };
  const snapshot: VendorSnapshot = {
    groups: {},
    videoOptions: array(video.data.Video.CodeList),
  };
  const reads = new Map<string, Feature>([["/getMediaVideoConfig", video]]);
  for (const group of Object.keys(vendorGroups) as VendorGroup[]) {
    const ep = vendorGroups[group].read;
    if (!reads.has(ep))
      reads.set(
        ep,
        await conn.feature(async () =>
          parseVendorDocument(await conn.vendorRequest(ep)),
        ),
      );
    const read = reads.get(ep)!;
    snapshot.groups[group] =
      read.state === "available"
        ? await conn.feature(async () => extractVendorGroup(read.data, group))
        : read;
  }
  return { state: "available", data: snapshot };
}
function target(data: any, path: string) {
  const parts = path.split(".");
  const attr = "@_" + parts.pop();
  for (const part of parts) {
    if (part === "main" || part === "sub") {
      const matches = array(data?.EncodeConfig).filter(
        (n) => n?.["@_Stream"] === (part === "main" ? "1" : "2"),
      );
      if (matches.length !== 1)
        throw Error("Flux constructeur absent ou ambigu.");
      data = matches[0];
    } else data = data?.[part];
    if (Array.isArray(data)) throw Error("Bloc constructeur ambigu.");
  }
  if (!data || typeof data !== "object" || typeof data[attr] !== "string")
    throw Error("ActionNotSupported : champ absent de la réponse caméra.");
  return { node: data, attr };
}
function walk(node: any, fn: (n: any) => void) {
  if (!node || typeof node !== "object") return;
  if (!Array.isArray(node)) fn(node);
  for (const v of Object.values(node))
    if (v && typeof v === "object") walk(v, fn);
}
export function vendorGroupFor(id: string): VendorGroup | undefined {
  return id === "privacyMask"
    ? "mask"
    : id === "inputAlarm"
      ? "input"
      : vendorMappings[id]?.group;
}
export function vendorValue(data: any, id: string): DefaultValue {
  if (id === "osd") {
    const custom = array(data.__userOverlay?.UserOSD);
    if (
      !["0", "1"].includes(data["@_Enable"]) ||
      custom.some((n) => !["0", "1"].includes(n["@_enable"]))
    )
      throw Error("État OSD constructeur non vérifié.");
    return (
      data["@_Enable"] === "1" || custom.some((n) => n["@_enable"] === "1")
    );
  }
  if (id === "localStorage") {
    if (!["0", "1"].includes(data.Common?.["@_LocalEnable"]))
      throw Error("Stockage local non vérifié.");
    let active = data.Common["@_LocalEnable"] === "1";
    walk(data, (n) => {
      if ("@_LocalStore" in n) {
        if (!["0", "1"].includes(n["@_LocalStore"]))
          throw Error("État du stockage par événement non vérifié.");
        if (n["@_LocalStore"] === "1") active = true;
      }
    });
    return active;
  }
  if (id === "privacyMask") {
    let count = 0;
    let empty = true;
    walk(data, (n) => {
      for (const [k, v] of Object.entries(n))
        if (/^@_Area\d+(PosX|PosY|Width|Height)$/.test(k)) {
          count++;
          if (Number(v) !== 0) empty = false;
        }
    });
    if (count !== 32) throw Error("Format de masques non reconnu.");
    return empty ? "Clear" : "Masques présents";
  }
  if (id === "inputAlarm") {
    const channels = array(data?.AlarmChannel);
    if (
      !channels.length ||
      channels.some((n) => !["0", "1"].includes(n?.["@_Enable"]))
    )
      throw Error("Canaux IO non vérifiés.");
    return channels.some((n) => n["@_Enable"] === "1");
  }
  const m = vendorMappings[id];
  if (!m) throw Error("Champ non intégré.");
  const { node, attr } = target(data, m.path);
  let raw = node[attr];
  if (m.packed != null) {
    if (!/^\d+$/.test(raw) || Number(raw) > 0x1ffffff)
      throw Error("Balance des blancs non reconnue.");
    raw = String((Number(raw) >>> m.packed) & 255);
  }
  if (m.values) {
    const value = Object.entries(m.values).find(([, v]) => v === raw)?.[0];
    if (value !== undefined && m.numericEnum) return Number(value);
    return value === "true"
      ? true
      : value === "false"
        ? false
        : (value ?? `Valeur caméra : ${raw}`);
  }
  if (m.min != null) {
    if (!/^\d+$/.test(raw)) throw Error("Valeur caméra numérique invalide.");
    return Number(raw);
  }
  return raw;
}
function put(data: any, id: string, value: DefaultValue) {
  vendorValue(data, id); // Prove that the complete readable field exists before adding anything.
  if (id === "privacyMask") {
    if (value !== "Clear")
      throw Error("Conserver : aucun changement des masques.");
    walk(data, (n) => {
      for (const k of Object.keys(n))
        if (/^@_Area\d+(PosX|PosY|Width|Height)$/.test(k)) n[k] = "0";
    });
    return;
  }
  if (id === "inputAlarm") {
    if (typeof value !== "boolean") throw Error("Valeur IO invalide.");
    for (const n of array(data.AlarmChannel)) n["@_Enable"] = value ? "1" : "0";
    return;
  }
  const m = vendorMappings[id];
  const { node, attr } = target(data, m.path);
  let raw = String(value);
  if (m.values) {
    raw = m.values[raw];
    if (raw === undefined)
      throw Error("Valeur non proposée par cet adaptateur.");
  } else if (
    m.min != null &&
    (typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < m.min ||
      value > m.max!)
  )
    throw Error("Valeur hors des capacités du champ constructeur.");
  if (id === "lightBrightness" && Number(value) % 10)
    throw Error("Luminosité proposée par pas de 10 % sur ce protocole.");
  node[attr] =
    m.packed != null
      ? String(
          (Number(node[attr]) & ~(255 << m.packed)) +
            Number(raw) * 2 ** m.packed,
        )
      : raw;
  if (id === "osd" && value === false)
    for (const n of array(data.__userOverlay?.UserOSD)) n["@_enable"] = "0";
  if (id === "localStorage" && value === false)
    walk(data, (n) => {
      if ("@_LocalStore" in n) n["@_LocalStore"] = "0";
    });
}
export function validateVendorField(
  data: any,
  id: string,
  value: DefaultValue,
) {
  // Validate independent fields before preparing a group, so one invalid value
  // does not prevent unrelated settings in the same endpoint from being applied.
  put(structuredClone(data), id, value);
}
export function vendorFingerprint(data: any) {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
export function vendorBody(group: VendorGroup, data: any) {
  const spec = vendorGroups[group];
  if (group === "overlay") {
    data = structuredClone(data);
    delete data.__userOverlay;
  }
  // These endpoints accept only their own subtree, not the complete get response.
  if (group === "mask" || group === "lan" || group === "overlay")
    return builder.build({ [spec.section]: data });
  return builder.build({
    [spec.root]: spec.section ? { [spec.section]: data } : data,
  });
}
export function vendorBackup(group: VendorGroup, data: any) {
  if (group !== "overlay" || !data.__userOverlay)
    return vendorBody(group, data);
  const overlay = structuredClone(data);
  delete overlay.__userOverlay;
  return builder.build({
    Video: { Overlay: overlay, UserOverlay: data.__userOverlay },
  });
}
export function vendorWrites(
  group: VendorGroup,
  data: any,
  values: Record<string, DefaultValue>,
) {
  const requests = [
    {
      endpoint: vendorGroups[group].write as string,
      body: vendorBody(group, data),
    },
  ];
  if (group === "overlay" && values.osd === false && data.__userOverlay)
    requests.push({
      endpoint: "/setMediaVideoUserOverlayConfig",
      body: builder.build({ UserOverlay: data.__userOverlay }),
    });
  return requests;
}

export function resolveVendorResolution(
  snapshot: VendorSnapshot,
  wanted: string,
  codec?: string,
): string {
  const encode = snapshot.groups.encode;
  if (encode?.state !== "available")
    throw Error("Lecture de l’encodeur indisponible.");
  const main = array(encode.data.EncodeConfig).filter(
    (n) => n["@_Stream"] === "1",
  );
  if (main.length !== 1) throw Error("Flux constructeur absent ou ambigu.");
  const dimensions = (raw: string) => {
    const normalized = raw.trim().toUpperCase();
    if (normalized === "1080P") return [1920, 1080];
    if (normalized === "720P") return [1280, 720];
    const match = /^(\d+)\s*[X×]\s*(\d+)$/.exec(normalized);
    return match ? [Number(match[1]), Number(match[2])] : undefined;
  };
  const target = dimensions(wanted);
  const offered = snapshot.videoOptions.filter(
    (n) =>
      n["@_Stream"] === "0" &&
      n["@_EncodeFormat"] === (codec ?? main[0]["@_EncodeFormat"]),
  );
  if (wanted === "Résolution maximale") {
    const ranked = offered
      .map((n) => {
        const raw = n["@_Resolution"];
        if (typeof raw !== "string")
          throw Error(
            "Résolution maximale non vérifiable : définition absente.",
          );
        const size = dimensions(raw);
        const mp = /^(\d+(?:\.\d+)?)MP$/i.exec(raw.trim());
        // Named sizes are used only to rank advertised choices; the original
        // device token is always sent back, never an invented resolution.
        const named: Record<string, number> = {
          "4K": 3840 * 2160,
          UHD: 3840 * 2160,
          D1: 720 * 576,
          VGA: 640 * 480,
          CIF: 352 * 288,
          QCIF: 176 * 144,
        };
        const pixels = size
          ? size[0] * size[1]
          : mp
            ? Number(mp[1]) * 1000000
            : named[raw.toUpperCase()];
        if (!Number.isFinite(pixels) || pixels <= 0)
          throw Error(
            `Résolution maximale non vérifiable : définition « ${raw} » non reconnue.`,
          );
        return { raw, pixels };
      })
      .sort(
        (a, b) =>
          b.pixels - a.pixels ||
          a.raw.localeCompare(b.raw, undefined, { numeric: true }),
      );
    if (!ranked.length)
      throw Error("Résolution maximale non proposée pour ce codec.");
    return (
      ranked.find(
        (r) =>
          r.pixels === ranked[0].pixels && r.raw === main[0]["@_Resolution"],
      )?.raw ?? ranked[0].raw
    );
  }
  const candidates = [
    ...new Set<string>(
      offered
        .map((n) => n["@_Resolution"])
        .filter((raw): raw is string => {
          if (typeof raw !== "string") return false;
          if (raw === wanted) return true;
          const size = dimensions(raw);
          if (!size) return false;
          if (wanted === "3MP")
            return size[0] * size[1] >= 2700000 && size[0] * size[1] <= 3400000;
          return !!target && size[0] === target[0] && size[1] === target[1];
        }),
    ),
  ];
  const current = main[0]["@_Resolution"];
  if (candidates.includes(current)) return current;
  if (candidates.length === 1) return candidates[0];
  throw Error(
    wanted +
      " : résolution non proposée ou ambiguë pour ce codec. Choisissez une définition précise dans le profil.",
  );
}

export function buildVendorChange(
  snapshot: VendorSnapshot,
  group: VendorGroup,
  values: Record<string, DefaultValue>,
) {
  const feature = snapshot.groups[group];
  if (feature?.state !== "available")
    throw Error(
      feature?.message || "Lecture du bloc constructeur indisponible.",
    );
  values = { ...values };
  if (group === "encode" && "resolution" in values)
    values.resolution = resolveVendorResolution(
      snapshot,
      String(values.resolution),
      values.codec === undefined ? undefined : String(values.codec),
    );
  const data = structuredClone(feature.data);
  for (const [id, value] of Object.entries(values)) {
    if (vendorGroupFor(id) !== group) throw Error("Champ hors de ce groupe.");
    put(data, id, value);
  }
  if (group === "encode") {
    const main = array(data.EncodeConfig).find((n) => n["@_Stream"] === "1");
    const caps = snapshot.videoOptions.filter(
      (n) =>
        n["@_Stream"] === "0" &&
        n["@_EncodeFormat"] === main?.["@_EncodeFormat"] &&
        n["@_Resolution"] === main?.["@_Resolution"],
    );
    if (caps.length !== 1)
      throw Error("Codec / résolution non proposés par la caméra.");
    for (const [field, attr] of [
      ["fps", "FrameRate"],
      ["bitrate", "BitRate"],
    ]) {
      if (field in values || "codec" in values || "resolution" in values) {
        const current = Number(main["@_" + attr]),
          min = Number(caps[0]["@_Min" + attr]),
          max = Number(caps[0]["@_Max" + attr]);
        if (
          ![current, min, max].every(Number.isFinite) ||
          current < min ||
          current > max
        )
          throw Error(field + " hors des capacités codec / résolution.");
      }
    }
    if (Number(main?.["@_qp_min"]) > Number(main?.["@_qp_max"]))
      throw Error("QP minimum supérieur au QP maximum.");
  }
  return {
    data,
    values,
    body: vendorBody(group, data),
    fingerprint: vendorFingerprint(feature.data),
  };
}
export const integratedVendorFields = vendorFieldIds;
