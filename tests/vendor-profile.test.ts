import { expect, it } from "vitest";
import {
  buildVendorChange,
  parseVendorDocument,
  extractVendorGroup,
  vendorValue,
  vendorBody,
  vendorWrites,
  resolveVendorResolution,
} from "../src/main/vendor-profile";
import { prepareDefaults } from "../src/main/defaults";
import { initialDefaults } from "../src/shared/defaults";
import { countRows, rowStatus } from "../src/shared/profile-journal";
const xml = `<Video><Capture Brightness="128" WB_RGB="8421504" shutter_mode="0" shutter_speed_day="1000" SNF="128" Unrelated="keep &amp; preserve"/><Encode><EncodeConfig Stream="1" Enable="1" EncodeFormat="H264" Resolution="3MP" BitRate="2500" FrameRate="10" Initquant="40" BitRateControl="VBR" qp_min="30" qp_max="51"/><EncodeConfig Stream="2" Enable="1" EncodeFormat="H265" Resolution="640X360" BitRate="500" FrameRate="20"/><AdvanceEncodeConfig EncodeProfile="0"/></Encode><CodeList Stream="0" EncodeFormat="H264" Resolution="3MP" MinBitRate="512" MaxBitRate="5120" MinFrameRate="5" MaxFrameRate="25"/></Video>`;
function snapshot() {
  const d = parseVendorDocument(xml);
  return {
    groups: {
      capture: {
        state: "available" as const,
        data: extractVendorGroup(d, "capture"),
      },
      encode: {
        state: "available" as const,
        data: extractVendorGroup(d, "encode"),
      },
    },
    videoOptions: [d.Video.CodeList],
  };
}
it("préserve les autres gains et attributs lors du changement du mode de balance des blancs", () => {
  const s = snapshot();
  const change = buildVendorChange(s, "capture", {
    awbMode: "MANUAL",
    awbRed: 132,
    dayShutterMode: "Manual",
    dayShutterSpeed: 10,
  });
  expect(vendorValue(change.data, "awbMode")).toBe("MANUAL");
  expect(vendorValue(change.data, "awbRed")).toBe(132);
  expect(vendorValue(change.data, "awbGreen")).toBe(128);
  expect(vendorValue(change.data, "awbBlue")).toBe(128);
  expect(parseVendorDocument(change.body).Video.Capture["@_Unrelated"]).toBe(
    "keep & preserve",
  );
  expect(vendorValue(s.groups.capture.data, "awbMode")).toBe("AUTO");
});
it("valide les plages du codec et conserve intégralement le flux secondaire", () => {
  const s = snapshot(),
    before = structuredClone(s.groups.encode.data.EncodeConfig[1]);
  const change = buildVendorChange(s, "encode", {
    fps: 25,
    bitrate: 5120,
    govLength: 25,
    bitrateControl: "CBR",
  });
  expect(change.data.EncodeConfig[1]).toEqual(before);
  expect(vendorValue(change.data, "bitrateControl")).toBe("CBR");
  expect(() => buildVendorChange(s, "encode", { fps: 30 })).toThrow(
    "capacités",
  );
  expect(() => buildVendorChange(s, "encode", { bitrate: 6000 })).toThrow(
    "capacités",
  );
  expect(() => buildVendorChange(s, "encode", { qpMin: 52 })).toThrow(
    "capacités",
  );
  expect(() => buildVendorChange(s, "encode", { resolution: "autre" })).toThrow(
    "résolution",
  );
});
it("résout 3MP vers la définition annoncée sans bloquer le débit, la cadence ou le flux secondaire", () => {
  const s = snapshot();
  s.groups.encode.data.EncodeConfig[0]["@_Resolution"] = "2304X1296";
  s.videoOptions[0]["@_Resolution"] = "2304X1296";
  const change = buildVendorChange(s, "encode", {
    resolution: "3MP",
    codec: "H264",
    bitrateControl: "CBR",
    fps: 25,
    bitrate: 5120,
    subStream: false,
  });
  expect(change.values.resolution).toBe("2304X1296");
  expect(vendorValue(change.data, "resolution")).toBe("2304X1296");
  expect(vendorValue(change.data, "fps")).toBe(25);
  expect(vendorValue(change.data, "subStream")).toBe(false);
  const p = initialDefaults();
  p.fields.resolution.value = "3MP";
  for (const [id, f] of Object.entries(p.fields))
    f.included = [
      "resolution",
      "codec",
      "fps",
      "bitrate",
      "subStream",
    ].includes(id);
  const absent = { state: "unverified" };
  const plan = prepareDefaults(p, {
    camera: { id: "fixture" },
    profiles: [],
    image: absent,
    video: absent,
    osd: absent,
    vendor: { state: "available", data: s },
  } as any);
  expect(plan.rows.find((r) => r.id === "resolution")).toMatchObject({
    state: "same",
    value: "2304X1296",
  });
  expect(plan.rows.filter((r) => r.state === "blocked")).toHaveLength(0);
  expect(
    plan.actions.find((a) => a.method === "setVendorDefaults")?.input.values,
  ).toMatchObject({ fps: 25, bitrate: 5120, subStream: false });
});
it("ne choisit ni une autre définition ni un autre codec sans capacité annoncée", () => {
  const s = snapshot();
  s.groups.encode.data.EncodeConfig[0]["@_Resolution"] = "1080P";
  s.videoOptions[0]["@_Resolution"] = "1080P";
  expect(resolveVendorResolution(s, "1920 × 1080")).toBe("1080P");
  expect(() => resolveVendorResolution(s, "3MP")).toThrow("non proposée");
  s.videoOptions.push(
    { ...s.videoOptions[0], "@_Resolution": "2304X1296" },
    { ...s.videoOptions[0], "@_Resolution": "2048X1536" },
  );
  expect(() => resolveVendorResolution(s, "3MP")).toThrow("ambiguë");
  expect(resolveVendorResolution(s, "2304 × 1296")).toBe("2304X1296");
  expect(() => resolveVendorResolution(s, "2304 × 1296", "H265")).toThrow(
    "non proposée",
  );
});
it("choisit le plus grand format annoncé pour le flux principal et le codec demandé", () => {
  const s = snapshot();
  s.videoOptions.push(
    { ...s.videoOptions[0], "@_Resolution": "1080P" },
    { ...s.videoOptions[0], "@_Resolution": "3840X2160" },
    { ...s.videoOptions[0], "@_Resolution": "12MP", "@_EncodeFormat": "H265" },
    { ...s.videoOptions[0], "@_Resolution": "16MP", "@_Stream": "1" },
  );
  expect(resolveVendorResolution(s, "Résolution maximale", "H264")).toBe(
    "3840X2160",
  );
  expect(resolveVendorResolution(s, "Résolution maximale", "H265")).toBe(
    "12MP",
  );
  expect(
    buildVendorChange(s, "encode", {
      resolution: "Résolution maximale",
      codec: "H264",
    }).values.resolution,
  ).toBe("3840X2160");
  s.videoOptions.push({ ...s.videoOptions[0], "@_Resolution": "5MP" });
  expect(resolveVendorResolution(s, "Résolution maximale", "H264")).toBe(
    "3840X2160",
  );
});
it("refuse un maximum impossible à déterminer plutôt que d’ignorer une définition inconnue", () => {
  const s = snapshot();
  s.videoOptions.push({ ...s.videoOptions[0], "@_Resolution": "Native" });
  expect(() => resolveVendorResolution(s, "Résolution maximale")).toThrow(
    "non vérifiable",
  );
});
it("refuse les champs absents, les flux ambigus et les XML avec entités externes", () => {
  expect(() =>
    buildVendorChange(snapshot(), "capture", { lightBrightness: 100 }),
  ).toThrow("champ absent");
  const s = snapshot();
  s.groups.encode.data.EncodeConfig.push(s.groups.encode.data.EncodeConfig[0]);
  expect(() => buildVendorChange(s, "encode", { fps: 25 })).toThrow("ambigu");
  expect(() =>
    parseVendorDocument(
      '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>',
    ),
  ).toThrow("invalide");
});
it("préserve les informations réseau et ne désactive que le paramètre ALLNET", () => {
  const data = parseVendorDocument(
    '<NetworkConfig><LANConfig ALLNET="1" DHCP="0" IPAddress="192.0.2.5" Netmask="255.255.255.0"/></NetworkConfig>',
  );
  const s = {
    groups: {
      lan: {
        state: "available" as const,
        data: extractVendorGroup(data, "lan"),
      },
    },
    videoOptions: [],
  };
  const c = buildVendorChange(s, "lan", { allSubnetOnvif: false });
  expect(parseVendorDocument(c.body)).toEqual({
    LANConfig: {
      "@_ALLNET": "0",
      "@_DHCP": "0",
      "@_IPAddress": "192.0.2.5",
      "@_Netmask": "255.255.255.0",
    },
  });
});
it("arrête les écritures locales par événement en désactivant le stockage", () => {
  const data = {
    Common: { "@_LocalEnable": "1", "@_RemoteEnable": "1" },
    ScheduleRecord: { "@_LocalStore": "1", "@_RemoteStore": "1" },
  };
  const c = buildVendorChange(
    { groups: { storage: { state: "available", data } }, videoOptions: [] },
    "storage",
    { localStorage: false },
  );
  expect(c.data.Common["@_LocalEnable"]).toBe("0");
  expect(c.data.ScheduleRecord["@_LocalStore"]).toBe("0");
  expect(c.data.ScheduleRecord["@_RemoteStore"]).toBe("1");
});
it("préfère le protocole web sans doubler les écritures ONVIF", () => {
  const p = initialDefaults();
  for (const [id, f] of Object.entries(p.fields))
    f.included = [
      "brightness",
      "awbMode",
      "fps",
      "bitrate",
      "bitrateControl",
    ].includes(id);
  p.fields.brightness.value = 130;
  const absent = { state: "unverified" };
  const detail: any = {
    camera: { id: "fixture" },
    network: absent,
    gateway: absent,
    dns: absent,
    image: absent,
    video: absent,
    osd: absent,
    lighting: absent,
    capabilities: absent,
    profiles: [],
    vendor: { state: "available", data: snapshot() },
  };
  const plan = prepareDefaults(p, detail);
  expect(plan.actions).toHaveLength(2);
  expect(plan.actions.every((a) => a.method === "setVendorDefaults")).toBe(
    true,
  );
  expect(plan.rows.every((r) => r.state === "ready")).toBe(true);
});
it("affiche une lecture échouée distinctement des incompatibilités confirmées, y compris les anciens bilans", () => {
  const base: any = {
    id: "brightness",
    label: "Luminosité",
    value: 128,
    state: "blocked",
    message: "Network timeout",
    code: "TIMEOUT",
  };
  expect(rowStatus(base)).toContain("Non vérifié");
  expect(
    countRows([
      base,
      { ...base, code: "ACTION_UNSUPPORTED" },
      { ...base, state: "manual" },
    ]),
  ).toMatchObject({ unread: 1, unavailable: 1, manual: 1 });
});
it("isole une valeur invalide et prépare les autres champs du même groupe", () => {
  const p = initialDefaults();
  for (const [id, f] of Object.entries(p.fields))
    f.included = ["brightness", "awbMode"].includes(id);
  p.fields.brightness.value = 300;
  const absent = { state: "unverified" };
  const plan = prepareDefaults(p, {
    camera: { id: "fixture" },
    network: absent,
    gateway: absent,
    dns: absent,
    image: absent,
    video: absent,
    osd: absent,
    lighting: absent,
    capabilities: absent,
    profiles: [],
    vendor: { state: "available", data: snapshot() },
  } as any);
  expect(plan.rows.find((r) => r.id === "brightness")).toMatchObject({
    state: "blocked",
    code: "VALUE_NOT_SUPPORTED",
  });
  expect(plan.rows.find((r) => r.id === "awbMode")).toMatchObject({
    state: "ready",
  });
  expect(plan.actions).toHaveLength(1);
  expect(plan.actions[0].input.values).toEqual({ awbMode: "MANUAL" });
});
it("distingue l’échec de détection web d’une fonction non intégrée", () => {
  const p = initialDefaults();
  for (const [id, f] of Object.entries(p.fields))
    f.included = ["awbMode", "drc"].includes(id);
  const absent = { state: "unverified" };
  const detail: any = {
    camera: { id: "fixture" },
    network: absent,
    gateway: absent,
    dns: absent,
    image: absent,
    video: absent,
    osd: absent,
    lighting: absent,
    capabilities: absent,
    profiles: [],
    vendor: { state: "error", message: "Network timeout" },
  };
  const plan = prepareDefaults(p, detail);
  expect(plan.rows.find((r) => r.id === "awbMode")).toMatchObject({
    state: "blocked",
    code: "TIMEOUT",
  });
  expect(plan.rows.find((r) => r.id === "drc")).toBeUndefined();
  detail.vendor = {
    state: "unsupported",
    message: "Protocole web non reconnu",
  };
  expect(
    prepareDefaults(p, detail).rows.find((r) => r.id === "awbMode"),
  ).toMatchObject({ state: "blocked", code: "ACTION_UNSUPPORTED" });
});

it("traduit 1,50 en option 17 et refuse une valeur hors de la liste fournie par la caméra", () => {
  const data = { "@_IrcutOpenLedDelay": "17" };
  const snapshot: any = {
    groups: { capture: { state: "available", data } },
    videoOptions: [],
  };
  expect(vendorValue(data, "lightThreshold1")).toBe(1.5);
  expect(
    buildVendorChange(snapshot, "capture", { lightThreshold1: 0.5 }).data[
      "@_IrcutOpenLedDelay"
    ],
  ).toBe("7");
  expect(() =>
    buildVendorChange(snapshot, "capture", { lightThreshold1: 1.55 }),
  ).toThrow("non proposée");
});
it("désactive et vérifie aussi les titres OSD personnalisés, en conservant leurs textes", () => {
  const d = parseVendorDocument(
    '<Video><Overlay Enable="0"><TitleOverlay TitleUtf8="abc"/></Overlay><UserOverlay><UserOSD enable="1" TitleUtf8="def"/></UserOverlay></Video>',
  );
  const data = extractVendorGroup(d, "overlay");
  expect(vendorValue(data, "osd")).toBe(true);
  const c = buildVendorChange(
    { groups: { overlay: { state: "available", data } }, videoOptions: [] },
    "overlay",
    { osd: false },
  );
  expect(vendorValue(c.data, "osd")).toBe(false);
  expect(c.body).not.toContain("__userOverlay");
  expect(c.data.__userOverlay.UserOSD["@_TitleUtf8"]).toBe("def");
  const writes = vendorWrites("overlay", c.data, { osd: false });
  expect(writes.map((w) => w.endpoint)).toEqual([
    "/setMediaVideoOverlayConfig",
    "/setMediaVideoUserOverlayConfig",
  ]);
  expect(parseVendorDocument(writes[1].body)).toEqual({
    UserOverlay: { UserOSD: { "@_enable": "0", "@_TitleUtf8": "def" } },
  });
});
