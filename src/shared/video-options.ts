// ONVIF Media1 uses codec children; Media2 uses one Options element per codec.
const list = (v: any): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const numbers = (v: unknown): number[] =>
  v == null
    ? []
    : String(v).trim().split(/\s+/).map(Number).filter(Number.isFinite);
export function videoCapabilities(entry: any, codec = entry?.config?.encoding) {
  const raw = entry?.options?.data;
  const media2 = Array.isArray(raw) || !!raw?.encoding;
  const o = media2
    ? list(raw).find((x) => x.encoding === codec)
    : (raw?.[codec] ?? raw?.[String(codec).toLowerCase()]);
  const fpsValues = numbers(o?.$?.FrameRatesSupported);
  const gov = numbers(o?.$?.GovLengthRange);
  const extension = raw?.extension?.[codec];
  const intersect = (a: any, b: any) =>
    !a
      ? b
      : !b
        ? a
        : { min: Math.max(a.min, b.min), max: Math.min(a.max, b.max) };
  return {
    raw,
    o,
    codecs: (media2
      ? list(raw).map((x) => x.encoding)
      : ["H264", "H265", "JPEG", "MPEG4"].filter(
          (c) => raw?.[c] || raw?.[c.toLowerCase()],
        )
    ).filter((c) => ["H264", "H265", "JPEG", "MPEG4"].includes(c)),
    resolutions: list(o?.resolutionsAvailable).map((r) => {
      const extra = list(extension?.resolutionsAvailable).find(
        (x) => x.width === r.width && x.height === r.height,
      );
      return {
        ...r,
        frameRateRange: intersect(r.frameRateRange, extra?.frameRateRange),
        bitrateRange: intersect(r.bitrateRange, extra?.bitrateRange),
      };
    }),
    profiles: media2
      ? String(o?.$?.ProfilesSupported ?? "")
          .split(/\s+/)
          .filter(Boolean)
      : list(o?.H264ProfilesSupported),
    fpsValues,
    fps:
      o?.frameRateRange ??
      (fpsValues.length
        ? { min: Math.min(...fpsValues), max: Math.max(...fpsValues) }
        : undefined),
    bitrate: o?.bitrateRange ?? raw?.extension?.[codec]?.bitrateRange,
    quality: raw?.qualityRange ?? o?.qualityRange,
    gov:
      (Number.isFinite(o?.govLengthRange?.min) &&
      Number.isFinite(o?.govLengthRange?.max)
        ? o.govLengthRange
        : undefined) ??
      (gov.length >= 2 && gov.every((n) => Number.isInteger(n) && n > 0)
        ? { min: Math.min(...gov), max: Math.max(...gov) }
        : undefined),
    govValues: gov.length > 2 ? gov : [],
    constantBitrate:
      o?.constantBitRateSupported === true ||
      o?.$?.ConstantBitRateSupported === true,
  };
}
