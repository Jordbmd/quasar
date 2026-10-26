import { XMLBuilder } from "fast-xml-parser";
import type { WebOSD } from "../shared/web-osd";
import { vendorValue } from "./vendor-profile";
const positions = {
  topLeft: ["0", "0"],
  topRight: ["1", "0"],
  bottomLeft: ["0", "1"],
  bottomRight: ["1", "1"],
  hidden: ["2", "2"],
};
function position(node: any): WebOSD["titlePosition"] {
  if (!node || Array.isArray(node)) throw Error("Position OSD non reconnue.");
  if (node["@_PosX"] === "2" && node["@_PosY"] === "2") return "hidden";
  if (node["@_PosType"] === "1") return "custom";
  const found = Object.entries(positions).find(
    ([, [x, y]]) => node["@_PosX"] === x && node["@_PosY"] === y,
  );
  if (!found) throw Error("Position OSD non reconnue.");
  return found[0] as WebOSD["titlePosition"];
}
export function readWebOSD(data: any): WebOSD {
  const hex = data.TitleOverlay?.["@_TitleUtf8"];
  if (typeof hex !== "string" || !/^(?:[0-9a-f]{2})*$/i.test(hex))
    throw Error("Texte OSD non reconnu.");
  return {
    enabled: vendorValue(data, "osd") === true,
    title: Buffer.from(hex, "hex").toString("utf8"),
    titlePosition: position(data.TitleOverlay),
    timePosition: position(data.TimeOverlay),
  };
}
export function changeWebOSD(before: any, values: WebOSD) {
  readWebOSD(before);
  if (
    Buffer.byteLength(values.title, "utf8") > 64 ||
    /[\x00-\x1f]/.test(values.title)
  )
    throw Error("Texte OSD limité à 64 octets, sans caractère de contrôle.");
  const data = structuredClone(before);
  data["@_Enable"] = values.enabled ? "1" : "0";
  for (const [key, value] of [
    ["TitleOverlay", values.titlePosition],
    ["TimeOverlay", values.timePosition],
  ] as const) {
    if (value === "custom") {
      if (position(before[key]) !== "custom")
        throw Error("Position personnalisée absente.");
      continue;
    }
    if (!positions[value]) throw Error("Position OSD invalide.");
    [data[key]["@_PosX"], data[key]["@_PosY"]] = positions[value];
    data[key]["@_PosType"] = "0";
  }
  data.TitleOverlay["@_TitleUtf8"] = Buffer.from(values.title, "utf8").toString(
    "hex",
  );
  data.TitleOverlay["@_Title"] = "";
  if (!values.enabled) {
    const nodes = data.__userOverlay?.UserOSD;
    for (const node of nodes == null
      ? []
      : Array.isArray(nodes)
        ? nodes
        : [nodes])
      node["@_enable"] = "0";
  }
  return data;
}
export function webOSDBody(data: any) {
  const overlay = structuredClone(data);
  delete overlay.__userOverlay;
  // The camera's own UI sends the bare Overlay subtree.
  return new XMLBuilder({ ignoreAttributes: false }).build({
    Overlay: overlay,
  });
}
