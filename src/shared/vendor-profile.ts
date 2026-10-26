// Protocol detection is based on returned configuration structure, never a model.
export const vendorGroups = {
  capture: {
    read: "/getMediaVideoConfig",
    write: "/setMediaVideoCaptureConfig",
    root: "Video",
    section: "Capture",
  },
  encode: {
    read: "/getMediaVideoConfig",
    write: "/setMediaVideoEncodeConfig",
    root: "Video",
    section: "Encode",
  },
  overlay: {
    read: "/getMediaVideoConfig",
    write: "/setMediaVideoOverlayConfig",
    root: "Video",
    section: "Overlay",
  },
  mask: {
    read: "/getMediaVideoConfig",
    write: "/setMediaVideoMaskConfig",
    root: "Video",
    section: "Mask",
  },
  audio: {
    read: "/getMediaAudioConfig",
    write: "/setMediaAudioConfig",
    root: "Audio",
    section: "",
  },
  storage: {
    read: "/getRecordConfig",
    write: "/setRecordConfig",
    root: "RecordConfig",
    section: "",
  },
  lan: {
    read: "/getNetworkConfig",
    write: "/setNetworkLANConfig",
    root: "NetworkConfig",
    section: "LANConfig",
  },
  motion: {
    read: "/getMotionDetectAlarm",
    write: "/setMotionDetectAlarm",
    root: "MotionDetectAlarm",
    section: "",
  },
  input: {
    read: "/getInputAlarm",
    write: "/setInputAlarm",
    root: "InputAlarm",
    section: "",
  },
} as const;
export type VendorGroup = keyof typeof vendorGroups;
export const vendorExtraWrites = [
  "/setMediaVideoUserOverlayConfig",
  "/setIRCutManual_DayNight",
];
type Mapping = {
  group: VendorGroup;
  path: string;
  min?: number;
  max?: number;
  values?: Record<string, string>;
  packed?: number;
  numericEnum?: boolean;
};
export const vendorMappings: Record<string, Mapping> = {};
const map = (
  id: string,
  group: VendorGroup,
  path: string,
  options: Omit<Mapping, "group" | "path"> = {},
) => {
  vendorMappings[id] = { group, path, ...options };
};
const bool = { values: { false: "0", true: "1" } };
for (const [id, attr] of Object.entries({
  brightness: "Brightness",
  colorSaturation: "Saturation",
  contrast: "Contrast",
  sharpness: "Sharpness",
  backlight: "BackLight",
  hlc: "HLC",
  denoise2d: "TNF",
  denoise3d: "SNF",
  defogRange: "DfrogValue",
  wdrRange: "WDRValue",
}))
  map(id, "capture", attr, { min: 0, max: 255 });
map("overexposure", "capture", "face_exposure_sensitivity", {
  min: 0,
  max: 100,
});
for (const [id, attr] of Object.entries({
  antiFlicker: "forct_antiflicker",
  horizonFlip: "HFlip",
  verticalFlip: "VFlip",
  defog: "DfrogFlag",
}))
  map(id, "capture", attr, bool);
map("videoFormat", "capture", "TVSystem", {
  values: { "50HZ": "1", "60HZ": "0" },
});
map("awbMode", "capture", "WB_RGB", {
  packed: 24,
  values: { AUTO: "0", MANUAL: "1" },
});
for (const [id, shift] of [
  ["awbRed", 16],
  ["awbGreen", 8],
  ["awbBlue", 0],
] as const)
  map(id, "capture", "WB_RGB", { packed: shift, min: 0, max: 255 });
for (const period of ["day"]) {
  map(
    period + "ShutterMode",
    "capture",
    period === "day" ? "shutter_mode" : "shutter_mode_night",
    { values: { Auto: "0", Manual: "1" } },
  );
  map(period + "ShutterSpeed", "capture", "shutter_speed_" + period, {
    min: 10,
    max: 10000,
  });
}
map("videoMode", "capture", "videoEncodeMode", {
  values: { Auto: "0", "Forced Frame Rate": "1" },
});
map("lightThreshold2", "capture", "light_off_sensitivity", {
  min: 0,
  max: 100,
});
map("lightThreshold1", "capture", "IrcutOpenLedDelay", {
  numericEnum: true,
  values: Object.fromEntries(
    [
      0.01, 0.05, 0.08, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1,
      1.2, 1.3, 1.4, 1.5,
    ].map((v, index) => [String(v), String(index)]),
  ),
});
map("lightMode", "capture", "led_mode", {
  values: { Infrared: "0", "Pure white light": "1", Auto: "2" },
});
map("lightImage", "capture", "ispadvmode", { values: { Normal: "0" } });
map("lightBrightnessMode", "capture", "led_brightness_mode", {
  values: { Auto: "0", Manual: "1" },
});
map("lightBrightness", "capture", "led_brightness_value", { min: 0, max: 100 });
map("mainStream", "encode", "main.Enable", bool);
map("subStream", "encode", "sub.Enable", bool);
map("codec", "encode", "main.EncodeFormat", {
  values: { H264: "H264", H265: "H265", JPEG: "JPEG", MPEG4: "MPEG4" },
});
map("resolution", "encode", "main.Resolution");
map("bitrateControl", "encode", "main.BitRateControl", {
  values: { CBR: "CBR", VBR: "VBR" },
});
map("govLength", "encode", "main.Initquant", { min: 1, max: 200 });
map("bitrate", "encode", "main.BitRate", { min: 1, max: 100000 });
map("fps", "encode", "main.FrameRate", { min: 1, max: 240 });
map("customQP", "encode", "main.qp_enable", bool);
map("qpMin", "encode", "main.qp_min", { min: 0, max: 51 });
map("qpMax", "encode", "main.qp_max", { min: 0, max: 51 });
map("h264Profile", "encode", "AdvanceEncodeConfig.EncodeProfile", {
  values: { High: "0", Main: "1", Baseline: "2" },
});
map("osd", "overlay", "Enable", bool);
map("audioEncode", "audio", "Encode.Enable", bool);
map("audioAmplify", "audio", "Capture.amplify", bool);
map("allSubnetOnvif", "lan", "ALLNET", bool);
// The record endpoint persists both the global switch and per-event LocalStore.
map("localStorage", "storage", "Common.LocalEnable", bool);
map("motionAlarm", "motion", "Enable", bool);
export const vendorFieldIds = [
  ...Object.keys(vendorMappings),
  "privacyMask",
  "inputAlarm",
];
