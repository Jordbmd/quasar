import type { DefaultValue } from "../shared/defaults";
import type { FieldVerification } from "../shared/profile-journal";
export function compareFields(
  expected: Record<string, DefaultValue | undefined>,
  actual: Record<string, DefaultValue | undefined>,
): Record<string, FieldVerification> {
  return Object.fromEntries(
    Object.entries(expected)
      .filter(([, v]) => v !== undefined)
      .map(([key, value]) => [
        key,
        {
          verified:
            actual[key] !== undefined && String(actual[key]) === String(value),
          ...(actual[key] === undefined ? {} : { observed: actual[key] }),
        },
      ]),
  );
}
export function videoReadback(input: any, got: any) {
  const size = (v: any) =>
    v?.width != null && v?.height != null
      ? `${v.width} × ${v.height}`
      : undefined;
  return compareFields(
    {
      codec: input.codec,
      resolution: size(input),
      fps: input.fps,
      bitrate: input.bitrate,
      govLength: input.govLength,
      h264Profile: input.h264Profile,
      bitrateControl:
        input.constantBitrate === undefined
          ? undefined
          : input.constantBitrate
            ? "CBR"
            : "VBR",
      quality: input.quality,
    },
    {
      codec: got?.encoding,
      resolution: size(got?.resolution),
      fps: got?.rateControl?.frameRateLimit,
      bitrate: got?.rateControl?.bitrateLimit,
      govLength: got?.[got.encoding]?.govLength ?? got?.$?.GovLength,
      h264Profile: got?.H264?.H264Profile ?? got?.$?.Profile,
      bitrateControl:
        got?.rateControl?.$?.ConstantBitRate === undefined
          ? undefined
          : got.rateControl.$.ConstantBitRate
            ? "CBR"
            : "VBR",
      quality: got?.quality,
    },
  );
}
