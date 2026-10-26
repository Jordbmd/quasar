import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readWebOSD, changeWebOSD, webOSDBody } from "../src/main/web-osd";
import { CameraService } from "../src/main/service";
import { Diagnostics } from "../src/main/diagnostics";
import { ProfileJournal } from "../src/main/profile-journal";
import { DefaultsStore, prepareDefaults } from "../src/main/defaults";
import { initialDefaults } from "../src/shared/defaults";
import { parseVendorDocument, vendorBody } from "../src/main/vendor-profile";
const overlay = {
  "@_Enable": "0",
  "@_Style": "3",
  "@_Week": "1",
  TitleOverlay: {
    "@_PosX": "0",
    "@_PosY": "0",
    "@_PosType": "0",
    "@_TitleUtf8": "43616d657261",
    "@_Title": "43616d657261",
  },
  TimeOverlay: {
    "@_PosX": "1",
    "@_PosY": "1",
    "@_PosType": "0",
    "@_Format": "yyyy-mm-dd hh:mm:ss",
  },
  __userOverlay: { UserOSD: { "@_enable": "0", "@_TitleUtf8": "4c6f676f" } },
};
it("active le vrai interrupteur OSD et conserve les attributs non édités", () => {
  const before = readWebOSD(overlay);
  const data = changeWebOSD(overlay, {
    ...before,
    enabled: true,
    title: "Entrée & A",
    timePosition: "topRight",
  });
  expect(readWebOSD(data)).toEqual({
    ...before,
    enabled: true,
    title: "Entrée & A",
    timePosition: "topRight",
  });
  expect(data["@_Style"]).toBe("3");
  expect(data.TimeOverlay["@_Format"]).toBe("yyyy-mm-dd hh:mm:ss");
  expect(data.__userOverlay).toEqual(overlay.__userOverlay);
  expect(overlay["@_Enable"]).toBe("0");
  expect(parseVendorDocument(webOSDBody(data)).Overlay["@_Enable"]).toBe("1");
  expect(vendorBody("overlay", data)).toBe(webOSDBody(data));
});
it("désactive aussi les textes personnalisés sans les effacer et protège les positions libres", () => {
  const before = structuredClone(overlay);
  before.__userOverlay.UserOSD["@_enable"] = "1";
  before.TimeOverlay = {
    ...before.TimeOverlay,
    "@_PosType": "1",
    "@_PosX": "45",
    "@_PosY": "65",
  };
  const values = readWebOSD(before);
  expect(values.enabled).toBe(true);
  const after = changeWebOSD(before, { ...values, enabled: false });
  expect(readWebOSD(after).enabled).toBe(false);
  expect(after.TimeOverlay).toEqual(before.TimeOverlay);
  expect(after.__userOverlay.UserOSD["@_TitleUtf8"]).toBe("4c6f676f");
  expect(() =>
    changeWebOSD(overlay, { ...readWebOSD(overlay), title: "é".repeat(33) }),
  ).toThrow("64");
  expect(() =>
    changeWebOSD(overlay, { ...readWebOSD(overlay), titlePosition: "custom" }),
  ).toThrow("absente");
});
it("migre les anciens profils sans perdre les valeurs conservées ni écraser le fichier", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "quasar-profile-"));
  try {
    const p = initialDefaults();
    p.revision = 7;
    p.fields.brightness.value = 99;
    p.fields.ircutMode.value = "Auto";
    p.fields.factoryReset = { included: true, value: true };
    p.fields.drc = { included: true, value: false };
    p.fields.nightShutterSpeed = { included: true, value: 10 };
    const file = path.join(dir, "profile.json");
    const original = JSON.stringify(p);
    await writeFile(file, original);
    const got = await new DefaultsStore(file).read();
    expect(got.revision).toBe(7);
    expect(got.fields.brightness.value).toBe(99);
    expect(got.fields.ircutMode.value).toBe("Manual → Day Model");
    expect(got.fields.factoryReset).toBeUndefined();
    expect(got.fields.drc).toBeUndefined();
    expect(await readFile(file, "utf8")).toBe(original);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
function lightingFixture() {
  let capture: any = {
    "@_IrcutMode": "2",
    "@_led_mode": "2",
    "@_led_brightness_mode": "2",
    "@_led_brightness_value": "30",
    "@_Brightness": "128",
  };
  let filter = "OFF";
  let ignoreDay = false;
  const writes: string[] = [];
  const controller = new AbortController();
  const conn: any = {
    camera: { id: "cam", ip: "192.168.1.14" },
    cam: { activeSource: { sourceToken: "source" }, profiles: [] },
    writeAttempts: 0,
    withReadSignal: async (_: any, fn: any) => fn(),
    call: async () => ({ irCutFilter: filter }),
    vendorRequest: async (ep: string, body: string) => {
      if (ep === "/getMediaVideoConfig") return vendorBody("capture", capture);
      conn.writeAttempts++;
      writes.push(ep);
      if (ep === "/setMediaVideoCaptureConfig")
        capture = parseVendorDocument(body).Video.Capture;
      else if (ep === "/setIRCutManual_DayNight" && !ignoreDay) {
        expect(body).toBe("DayMode");
        filter = "ON";
      }
      return "<Success/>";
    },
  };
  const service: any = Object.create(CameraService.prototype);
  Object.assign(service, {
    connections: new Map([["cam", conn]]),
    uncertain: new Set(),
    log: new Diagnostics(),
    profileJournal: new ProfileJournal(),
    connection: async () => conn,
    approve: vi.fn(async () => conn),
    camera: () => conn.camera,
  });
  return {
    service,
    conn,
    writes,
    controller,
    capture: () => capture,
    ignoreDay: () => {
      ignoreDay = true;
    },
  };
}
it("allume les LED blanches, relit les valeurs et ne réécrit pas à chaque lecture", async () => {
  const f = lightingFixture();
  expect(
    await f.service.preparePreviewLighting("cam", f.controller.signal),
  ).toBeUndefined();
  expect(f.capture()).toMatchObject({
    "@_IrcutMode": "3",
    "@_led_mode": "1",
    "@_led_brightness_mode": "1",
    "@_led_brightness_value": "100",
    "@_Brightness": "128",
  });
  expect(f.writes).toEqual(["/setMediaVideoCaptureConfig"]);
  await f.service.preparePreviewLighting("cam", f.controller.signal);
  expect(f.writes).toHaveLength(1);
  expect(f.service.approve).toHaveBeenCalledTimes(1);
});
it("ne confond pas l’accusé de réception jour et un état réellement relu", async () => {
  const f = lightingFixture();
  f.ignoreDay();
  expect(await f.service.setDayMode("cam")).toMatchObject({
    verified: false,
    acknowledged: true,
    fields: {
      ircutMode: {
        verified: false,
        observed: expect.stringContaining("filtre IR : OFF"),
        issues: [expect.objectContaining({ code: "READBACK_MISMATCH" })],
      },
    },
  });
  expect(f.service.uncertain.has("cam")).toBe(true);
});
it("ne commande pas les LED pour une caméra quittée pendant la vérification", async () => {
  const f = lightingFixture();
  f.service.approve = async () => {
    f.controller.abort(Error("remplacée"));
    return f.conn;
  };
  await expect(
    f.service.preparePreviewLighting("cam", f.controller.signal),
  ).rejects.toThrow("remplacée");
  expect(f.writes).toEqual([]);
});
it("affiche la vidéo avant la fin de l’éclairage et masque le retour d’une lecture arrêtée", async () => {
  const f = lightingFixture();
  const id = "00000000-0000-4000-8000-000000000001";
  let finish!: (warning?: string) => void;
  const pending = new Promise<string | undefined>((resolve) => {
    finish = resolve;
  });
  f.service.previewLighting = Promise.resolve();
  f.service.preparePreviewLighting = vi.fn(() => pending);
  f.service.onPreviewLighting = vi.fn();
  f.service.video = {
    start: async () => ({ url: "ws://127.0.0.1/preview-token" }),
    stop: async () => {},
  };
  f.conn.stream = async () => "rtsp://192.168.1.14/main";
  const result = await f.service.dispatch("startVideo", {
    id,
    profile: "main",
  });
  expect(result.url).toContain("preview-token");
  await f.service.stopVideo();
  finish("Ancienne caméra non disponible");
  await f.service.finishPreviewLighting();
  expect(f.service.onPreviewLighting).not.toHaveBeenCalled();
});
it("termine la relecture d’une écriture envoyée même quand l’utilisateur change de caméra", async () => {
  const f = lightingFixture();
  const request = f.conn.vendorRequest;
  f.conn.vendorRequest = async (ep: string, body: string) => {
    const result = await request(ep, body);
    if (ep === "/setMediaVideoCaptureConfig")
      f.controller.abort(Error("remplacée"));
    return result;
  };
  await expect(
    f.service.preparePreviewLighting("cam", f.controller.signal),
  ).rejects.toThrow("remplacée");
  expect(f.service.uncertain.size).toBe(0);
  expect(f.writes).toEqual(["/setMediaVideoCaptureConfig"]);
});
it("désactive le mode nuit uniquement après relecture du mode manuel et du filtre jour", async () => {
  const f = lightingFixture();
  expect(await f.service.setDayMode("cam")).toMatchObject({ verified: true });
  expect(f.writes).toEqual([
    "/setMediaVideoCaptureConfig",
    "/setIRCutManual_DayNight",
  ]);
  expect(f.capture()["@_led_mode"]).toBe("2");
});
it("applique le mode jour après les autres réglages de capture sans invalider leur empreinte", () => {
  const p = initialDefaults();
  for (const f of Object.values(p.fields)) f.included = false;
  p.fields.brightness = { included: true, value: 129 };
  p.fields.ircutMode.included = true;
  const absent = { state: "unverified" };
  const d: any = {
    camera: { id: "cam" },
    image: absent,
    video: absent,
    osd: absent,
    profiles: [],
    daylight: { state: "available", data: { day: false } },
    vendor: {
      state: "available",
      data: {
        groups: {
          capture: { state: "available", data: { "@_Brightness": "128" } },
        },
        videoOptions: [],
      },
    },
  };
  const plan = prepareDefaults(p, d);
  expect(plan.actions.map((a) => a.method)).toEqual([
    "setVendorDefaults",
    "setDayMode",
  ]);
});
