import { z } from "zod";
import { resetConfirmation } from "./factory-reset";
import { validateDefaults } from "./defaults";
import type { Api } from "./types";
const id = z.string().uuid();
const ip = z.ipv4();
const finite = z.number().finite();
const osdFields = {
  text: z.string().max(128).optional(),
  textType: z.enum(["Plain", "Date", "Time", "DateAndTime"]).optional(),
  position: z
    .enum(["UpperLeft", "UpperRight", "LowerLeft", "LowerRight", "Custom"])
    .optional(),
  fontSize: finite.int().min(0).max(1000).optional(),
  dateFormat: z.string().min(1).max(128).optional(),
  timeFormat: z.string().min(1).max(128).optional(),
  x: finite.min(-1).max(1).optional(),
  y: finite.min(-1).max(1).optional(),
};
const osdCorner = z.enum([
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
  "hidden",
  "custom",
]);
export const schemas = {
  previewFactoryReset: z
    .object({
      ids: z
        .array(id)
        .min(1)
        .max(256)
        .refine((ids) => new Set(ids).size === ids.length),
    })
    .strict(),
  applyFactoryReset: z
    .object({ planId: id, confirmation: z.literal(resetConfirmation) })
    .strict(),
  previewAddresses: z
    .object({ start: z.number().int().min(1).max(244) })
    .strict(),
  applyAddresses: z.object({ planId: id }).strict(),
  resolveIPConflict: z.object({ id, isolated: z.literal(true) }).strict(),
  setWebOSD: z
    .object({
      id,
      values: z
        .object({
          enabled: z.boolean(),
          title: z.string().max(64),
          titlePosition: osdCorner,
          timePosition: osdCorner,
        })
        .strict(),
    })
    .strict(),
  syncCameraTime: z
    .object({ id, timezone: z.enum(["Europe/Paris", "UTC"]) })
    .strict(),
  getDefaults: z.undefined(),
  auditDefaults: z
    .object({
      ids: z
        .array(id)
        .min(1)
        .max(256)
        .refine((ids) => new Set(ids).size === ids.length),
    })
    .strict(),
  listDefaultsRuns: z.undefined(),
  getDefaultsRun: z.object({ id }).strict(),
  exportDefaultsRun: z.object({ id }).strict(),
  saveDefaults: z.unknown().transform((v) => validateDefaults(v)),
  previewDefaults: z
    .object({
      ids: z
        .array(id)
        .min(1)
        .max(256)
        .refine((ids) => new Set(ids).size === ids.length, "Cibles dupliquées"),
    })
    .strict(),
  applyDefaults: z.object({ planId: id }).strict(),
  state: z.undefined(),
  discover: z.undefined(),
  addCamera: z
    .object({ ip, port: z.number().int().min(1).max(65535) })
    .strict(),
  connectSession: z
    .object({
      username: z.string().max(128),
      password: z.string().max(256),
    })
    .strict(),
  disconnectSession: z.undefined(),
  retryConnections: z.undefined(),
  selectCamera: z
    .object({ id, requestId: z.string().max(100).optional() })
    .strict(),
  readCamera: z
    .object({ id, requestId: z.string().max(100).optional() })
    .strict(),
  cancelCameraRead: z.undefined(),
  changeIP: z
    .object({ id, address: ip, mask: ip, isolated: z.boolean() })
    .strict(),
  setVideo: z
    .object({
      id,
      token: z.string().min(1).max(256),
      width: finite.int().positive(),
      height: finite.int().positive(),
      fps: finite.positive(),
      codec: z.enum(["H264", "H265", "JPEG", "MPEG4"]).optional(),
      constantBitrate: z.boolean().optional(),
      govLength: finite.int().positive().optional(),
      h264Profile: z.enum(["Baseline", "Main", "Extended", "High"]).optional(),
      quality: finite.optional(),
      bitrate: finite.int().positive().optional(),
    })
    .strict(),
  setImage: z
    .object({
      id,
      values: z.record(
        z.enum([
          "brightness",
          "contrast",
          "colorSaturation",
          "sharpness",
          "irCutFilter",
        ]),
        z.union([finite, z.enum(["ON", "OFF", "AUTO"])]),
      ),
    })
    .strict(),
  setOSD: z
    .object({
      id,
      token: z.string().min(1).max(256),
      ...osdFields,
    })
    .strict(),
  createOSD: z
    .object({ id, source: z.string().min(1).max(256), ...osdFields })
    .strict(),
  disableOSD: z
    .object({
      id,
      tokens: z.array(z.string().min(1).max(256)).min(1).max(64).optional(),
    })
    .strict(),
  restoreOSD: z.object({ id }).strict(),
  diagnose: z.object({ id }).strict(),
  setCameraNetwork: z
    .object({
      id,
      dhcp: z.boolean().optional(),
      address: ip.optional(),
      mask: ip.optional(),
      gateway: z.union([ip, z.literal("")]).optional(),
      dns: z.array(ip).max(4).optional(),
      isolated: z.boolean(),
    })
    .strict(),
  previewProfiles: z.object({ id }).strict(),
  startVideo: z.object({ id, profile: z.string().min(1).max(256) }).strict(),
  stopVideo: z.undefined(),
  openWeb: z.object({ id }).strict(),
  exportLogs: z.undefined(),
  copyLogs: z.undefined(),
} satisfies { [K in keyof Api]: z.ZodType<Api[K]["input"]> };

export type ValidatedRequest = {
  [K in keyof Api]: { method: K; input: Api[K]["input"] };
}[keyof Api];
export function parseRequest<K extends keyof Api>(
  method: K,
  input: unknown,
): ValidatedRequest {
  // Both the discriminant and parser use the same checked key.
  return { method, input: schemas[method].parse(input) } as ValidatedRequest;
}
