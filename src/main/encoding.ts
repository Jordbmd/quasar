import { XMLBuilder } from "fast-xml-parser";
import { local, nodes, parseXML, signature } from "./osd";
import type { Api } from "../shared/types";
import { videoCapabilities } from "../shared/video-options";
const builder = new XMLBuilder({
  preserveOrder: true,
  ignoreAttributes: false,
});
const order = [
  "Name",
  "UseCount",
  "Encoding",
  "Resolution",
  "Quality",
  "RateControl",
  "MPEG4",
  "H264",
  "Multicast",
  "SessionTimeout",
  "Extension",
];
function child(tree: any[], name: string, create = false): any {
  let node = tree.find((n) =>
    Object.keys(n).some((k) => k !== ":@" && local(k) === name),
  );
  if (!node && create) {
    node = { [`tt:${name}`]: [] };
    const index = tree.findIndex((n) => {
      const k = Object.keys(n).find((k) => k !== ":@");
      return k && order.indexOf(local(k)) > order.indexOf(name);
    });
    tree.splice(index < 0 ? tree.length : index, 0, node);
  }
  if (!node) throw Error(`Champ vidéo ${name} absent de la configuration lue.`);
  return node;
}
function children(n: any): any[] {
  return n[Object.keys(n).find((k) => k !== ":@")!];
}
function set(tree: any[], keys: string[], value: string | number) {
  const n = child(tree, keys[0]);
  if (keys.length === 1) {
    const xs = children(n);
    xs.splice(0, xs.length, { "#text": String(value) });
  } else set(children(n), keys.slice(1), value);
}
export function encoderFingerprint(xml: string, token: string) {
  const tree = parseXML(xml);
  const configs = [
    ...nodes(tree, "Configuration"),
    ...nodes(tree, "Configurations"),
  ].filter((n) => String(n.attributes["@_token"]) === token);
  if (configs.length !== 1)
    throw Error("Configuration encodeur ambiguë ou absente.");
  return signature(
    builder.build([
      {
        "enc:Configuration": configs[0].children,
        ":@": {
          ...configs[0].attributes,
          "@_xmlns:enc": "http://www.onvif.org/ver10/schema",
        },
      },
    ]),
  );
}
export function encoderPayload(
  xml: string,
  token: string,
  ns: string,
  v: Api["setVideo"]["input"],
  entry: any,
): string {
  const tree = parseXML(xml);
  const matches = [
    ...nodes(tree, "Configuration"),
    ...nodes(tree, "Configurations"),
  ].filter((x) => String(x.attributes["@_token"]) === token);
  if (matches.length !== 1)
    throw Error("Configuration encodeur ambiguë ou absente.");
  const n = matches[0],
    xs = n.children;
  const attrs = {
    ...n.attributes,
    "@_xmlns:sz": ns,
    "@_xmlns:tt": "http://www.onvif.org/ver10/schema",
  };
  set(xs, ["Resolution", "Width"], v.width);
  set(xs, ["Resolution", "Height"], v.height);
  set(xs, ["RateControl", "FrameRateLimit"], v.fps);
  if (v.quality !== undefined) set(xs, ["Quality"], v.quality);
  if (v.bitrate !== undefined)
    set(xs, ["RateControl", "BitrateLimit"], v.bitrate);
  if (v.constantBitrate !== undefined) {
    const rate = child(xs, "RateControl");
    rate[":@"] = {
      ...rate[":@"],
      "@_ConstantBitRate": String(v.constantBitrate),
    };
  }
  const codec = v.codec ?? entry.config.encoding;
  if (codec !== entry.config.encoding) {
    set(xs, ["Encoding"], codec);
    for (let i = xs.length - 1; i >= 0; i--) {
      const name = Object.keys(xs[i]).find((k) => k !== ":@");
      if (name && ["H264", "MPEG4"].includes(local(name))) xs.splice(i, 1);
    }
    const caps = videoCapabilities(entry, codec),
      opts = caps.o;
    if (!ns.includes("ver20") && ["H264", "MPEG4"].includes(codec)) {
      const profiles =
        codec === "H264"
          ? opts?.H264ProfilesSupported
          : (opts?.mpeg4ProfilesSupported ??
            opts?.Mpeg4ProfilesSupported ??
            opts?.MPEG4ProfilesSupported);
      const profile = Array.isArray(profiles) ? profiles[0] : profiles;
      if (!profile || !Number.isFinite(opts?.govLengthRange?.min))
        throw Error(
          "Options de profil / I-Frame insuffisantes pour changer de codec sans inventer des paramètres.",
        );
      const element = child(xs, codec, true);
      element[`tt:${codec}`] = [
        {
          "tt:GovLength": [
            { "#text": String(v.govLength ?? opts.govLengthRange.min) },
          ],
        },
        {
          [`tt:${codec === "MPEG4" ? "Mpeg4" : codec}Profile`]: [
            { "#text": String(profile) },
          ],
        },
      ];
    }
    if (ns.includes("ver20")) {
      const profiles = String(opts?.$?.ProfilesSupported ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (codec === "JPEG") {
        delete attrs["@_Profile"];
        delete attrs["@_GovLength"];
        delete attrs["@_AnchorFrameDistance"];
      } else {
        if (!profiles.length || !caps.gov)
          throw Error(
            "Options de profil / I-Frame insuffisantes pour changer de codec.",
          );
        attrs["@_Profile"] = profiles.includes(String(attrs["@_Profile"]))
          ? attrs["@_Profile"]
          : profiles[0];
        const oldGov = Number(attrs["@_GovLength"]);
        attrs["@_GovLength"] = String(
          v.govLength ??
            (oldGov >= caps.gov.min && oldGov <= caps.gov.max
              ? oldGov
              : caps.gov.min),
        );
        if (
          Number(attrs["@_AnchorFrameDistance"]) > 1 &&
          !(
            Number(opts?.$?.MaxAnchorFrameDistance) >=
            Number(attrs["@_AnchorFrameDistance"])
          )
        )
          throw Error(
            "Le nouveau codec ne confirme pas le réglage B-Frames existant. Utilisez l’interface web.",
          );
      }
    }
  }
  if (v.h264Profile !== undefined) {
    if (
      codec !== "H264" ||
      !videoCapabilities(entry, codec).profiles.includes(v.h264Profile)
    )
      throw Error("Profil H.264 non annoncé par la caméra.");
    if (ns.includes("ver20")) attrs["@_Profile"] = v.h264Profile;
    else set(xs, ["H264", "H264Profile"], v.h264Profile);
  }
  if (v.govLength !== undefined) {
    if (ns.includes("ver20")) attrs["@_GovLength"] = String(v.govLength);
    else set(xs, [codec, "GovLength"], v.govLength);
  }
  return builder.build([{ "sz:Configuration": xs, ":@": attrs }]);
}
