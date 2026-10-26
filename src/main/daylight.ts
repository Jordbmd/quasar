import type { CameraConnection } from "./onvif";
import { array, token, xmlEscape } from "./onvif";
import { extractVendorGroup, parseVendorDocument } from "./vendor-profile";
export async function readDaylight(conn: CameraConnection) {
  const capture = extractVendorGroup(
    parseVendorDocument(await conn.vendorRequest("/getMediaVideoConfig")),
    "capture",
  );
  if (!["0", "1", "2", "3"].includes(capture["@_IrcutMode"]))
    throw Error("Commande jour/nuit non reconnue.");
  const sources = [
    ...new Set(
      array(conn.cam.profiles)
        .map((p) => p.videoSourceConfiguration?.sourceToken)
        .filter(Boolean),
    ),
  ];
  const source =
    conn.cam.activeSource?.sourceToken ||
    (sources.length === 1 ? sources[0] : undefined);
  if (!source) throw Error("Source vidéo jour/nuit non vérifiable.");
  const image = await conn.call("getImagingSettings", {
    token: xmlEscape(source),
  });
  if (!["ON", "OFF", "AUTO"].includes(image.irCutFilter))
    throw Error("État du filtre jour/nuit non vérifiable.");
  return {
    capture,
    day: capture["@_IrcutMode"] === "3" && image.irCutFilter === "ON",
    filter: image.irCutFilter,
  };
}
