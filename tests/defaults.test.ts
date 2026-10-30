import { describe, it, expect, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DefaultsManager,
  DefaultsStore,
  prepareDefaults,
} from "../src/main/defaults";
import {
  initialDefaults,
  defaultFields,
  validateDefaults,
} from "../src/shared/defaults";
import {
  clockSettings,
  parseCameraClock,
  timezonesEquivalent,
  fixedClockSettings,
  clockTimezoneMatches,
  hasDSTClockError,
  localClockMatches,
} from "../src/main/camera-clock";
import type { CameraDetail } from "../src/shared/types";
const feature = { state: "available" as const, data: {} };
function detail(id = "one"): CameraDetail {
  return {
    camera: {
      id,
      ip: id === "one" ? "192.0.2.11" : "192.0.2.12",
      port: 80,
      path: "/onvif/device_service",
      serial: `SERIAL-${id}`,
      model: "Caméra de test",
      status: "Connectée",
      ambiguous: false,
    },
    network: feature,
    gateway: feature,
    dns: feature,
    lighting: feature,
    capabilities: feature,
    profiles: [],
    image: {
      state: "available",
      data: {
        settings: {
          brightness: 50,
          contrast: 128,
          sharpness: 128,
          colorSaturation: 128,
        },
        options: Object.fromEntries(
          ["brightness", "contrast", "sharpness", "colorSaturation"].map(
            (k) => [k, { min: 0, max: 255 }],
          ),
        ),
      },
    },
    video: {
      state: "available",
      data: [
        {
          name: "MainStream",
          config: {
            $: { token: "main" },
            encoding: "H264",
            resolution: { width: 2304, height: 1296 },
            rateControl: {
              frameRateLimit: 20,
              bitrateLimit: 4096,
              $: { ConstantBitRate: false },
            },
            H264: { govLength: 50, H264Profile: "Main" },
          },
          options: {
            state: "available",
            data: {
              H264: {
                resolutionsAvailable: [
                  { width: 2304, height: 1296 },
                  { width: 1920, height: 1080 },
                ],
                frameRateRange: { min: 1, max: 30 },
                govLengthRange: { min: 1, max: 100 },
                bitrateRange: { min: 128, max: 8192 },
                H264ProfilesSupported: ["Main", "High"],
                constantBitRateSupported: true,
              },
            },
          },
        },
      ],
    },
    osd: {
      state: "available",
      data: { settings: [{ token: "name", text: "Camera" }], options: [] },
    },
    clock: {
      state: "available",
      data: {
        at: Date.now(),
        timezone: "UTC0",
        mode: "Manual",
        daylightSavings: false,
      },
    },
  };
}
function harness() {
  let epoch = 1;
  const data = new Map(["one", "two"].map((id) => [id, detail(id)]));
  const store = new DefaultsStore();
  const write = vi.fn(async (): Promise<WriteResult> => ({
    sent: true,
    acknowledged: true,
    verified: true,
    message: "Relu et vérifié",
  }));
  const read = vi.fn(async (id: string) => structuredClone(data.get(id)!));
  const progress = vi.fn();
  const manager = new DefaultsManager(store, {
    epoch: () => epoch,
    camera: (id) => {
      if (!data.has(id)) throw Error("Cible inconnue");
      return data.get(id)!.camera;
    },
    read,
    check: async () => {},
    write,
    progress,
    safe: (e) => (e instanceof Error ? e.message : String(e)),
  });
  return {
    store,
    manager,
    data,
    write,
    read,
    progress,
    changeNetwork: () => epoch++,
  };
}
describe("Profil Sezaam", () => {
  it("reprend la fiche avec les seuils corrigés et exclut toute commande usine", () => {
    const p = initialDefaults();
    expect(defaultFields.length).toBe(52);
    expect(defaultFields.find((f) => f.id === "lightThreshold2")).toMatchObject(
      { label: "Light OFF Sensitivity", value: 36 },
    );
    const plan = prepareDefaults(p, detail());
    expect(plan.actions.map((a) => a.method)).toEqual([
      "setImage",
      "setVideo",
      "disableOSD",
      "syncCameraTime",
    ]);
    expect(plan.rows.find((r) => r.id === "factoryReset")).toBeUndefined();
    expect(plan.rows.find((r) => r.id === "lightMode")?.state).toBe("manual");
    expect(
      plan.actions.find((a) => a.method === "setVideo")?.input,
    ).toMatchObject({
      width: 2304,
      height: 1296,
      codec: "H264",
      fps: 25,
      bitrate: 5120,
      govLength: 25,
      constantBitrate: true,
      h264Profile: "High",
    });
  });
  it("ne convertit pas 128 vers une échelle 0–100 et respecte les exclusions", () => {
    const p = initialDefaults(),
      d = detail();
    d.image.data.options.brightness.max = 100;
    p.fields.fps.included = false;
    const plan = prepareDefaults(p, d);
    expect(plan.rows.find((r) => r.id === "brightness")?.state).toBe("blocked");
    expect(plan.actions.some((a) => a.method === "setImage")).toBe(false);
    expect(plan.actions.find((a) => a.method === "setVideo")?.input.fps).toBe(
      20,
    );
    expect(plan.rows.some((r) => r.id === "fps")).toBe(false);
  });
  it("ne choisit pas une résolution de remplacement ni un flux principal ambigu", () => {
    const d = detail();
    const fixed = initialDefaults();
    fixed.fields.resolution.value = "3MP";
    d.video.data[0].options.data.H264.resolutionsAvailable = [
      { width: 1920, height: 1080 },
    ];
    expect(
      prepareDefaults(fixed, d).actions.some((a) => a.method === "setVideo"),
    ).toBe(false);
    const d2 = detail();
    d2.video.data[0].name = "Stream1";
    d2.video.data.push({
      ...structuredClone(d2.video.data[0]),
      config: { ...d2.video.data[0].config, $: { token: "other" } },
    });
    expect(
      prepareDefaults(initialDefaults(), d2).rows.find((r) => r.id === "codec")
        ?.message,
    ).toContain("ambigu");
  });
  it("choisit la résolution maximale du codec, même si la caméra utilise déjà une résolution inférieure", () => {
    const p = initialDefaults(),
      d = detail();
    expect(p.fields.resolution.value).toBe("Résolution maximale");
    d.video.data[0].options.data.H264.resolutionsAvailable.push({
      width: 3840,
      height: 2160,
    });
    const plan = prepareDefaults(p, d);
    expect(
      plan.actions.find((a) => a.method === "setVideo")?.input,
    ).toMatchObject({ width: 3840, height: 2160 });
    expect(plan.rows.find((r) => r.id === "resolution")).toMatchObject({
      value: "3840 × 2160",
      state: "ready",
    });
  });
  it("ne baisse pas la résolution maximale pour contourner une cadence incompatible", () => {
    const p = initialDefaults(),
      d = detail();
    d.video.data[0].options.data.H264.resolutionsAvailable.push({
      width: 3840,
      height: 2160,
      frameRateRange: { min: 1, max: 15 },
    });
    const plan = prepareDefaults(p, d);
    expect(plan.actions.some((a) => a.method === "setVideo")).toBe(false);
    expect(plan.rows.find((r) => r.id === "resolution")?.state).toBe("blocked");
  });
  it("détecte les objets OSD et bloque une restauration sans sauvegarde", () => {
    const p = initialDefaults(),
      d = detail();
    expect(
      prepareDefaults(p, d).actions.some((a) => a.method === "disableOSD"),
    ).toBe(true);
    d.osd.data.settings = [];
    p.fields.osd.value = true;
    expect(prepareDefaults(p, d).rows.find((r) => r.id === "osd")?.state).toBe(
      "blocked",
    );
    d.osdRestoreAvailable = true;
    expect(
      prepareDefaults(p, d).actions.some((a) => a.method === "restoreOSD"),
    ).toBe(true);
  });
  it("refuse les valeurs et schémas invalides", () => {
    const p = initialDefaults();
    p.fields.fps.value = NaN;
    expect(() => validateDefaults(p)).toThrow("Cadence");
    p.fields.fps.value = 25;
    p.fields.qpMin.value = 52;
    expect(() => validateDefaults(p)).toThrow("QP");
    expect(() =>
      validateDefaults({ ...initialDefaults(), fields: {} }),
    ).toThrow("invalide");
  });
  it("persiste le profil et refuse les écritures avec une ancienne révision", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "quasar-defaults-"));
    try {
      const file = path.join(dir, "profile.json"),
        s = new DefaultsStore(file);
      const p = await s.read();
      p.fields.fps.value = 20;
      const saved = await s.save(p);
      expect(saved.revision).toBe(1);
      expect((await new DefaultsStore(file).read()).fields.fps.value).toBe(20);
      await expect(s.save(p)).rejects.toThrow("modifié ailleurs");
      await writeFile(file, "bad json");
      await expect(s.read()).rejects.toThrow("illisible");
      expect(await readFile(file, "utf8")).toBe("bad json");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
describe("Application vérifiée en lot", () => {
  it.each(["preview", "audit"] as const)(
    "%s analyse les IP dans l’ordre numérique croissant",
    async (method) => {
      const h = harness();
      h.data.get("one")!.camera.ip = "192.0.2.100";
      h.data.get("two")!.camera.ip = "192.0.2.9";
      const result = await h.manager[method](["one", "two"]);
      expect(h.read.mock.calls.map(([id]) => id)).toEqual(["two", "one"]);
      expect(result.cameras.map((c) => c.camera.ip)).toEqual([
        "192.0.2.9",
        "192.0.2.100",
      ]);
      expect(h.write).not.toHaveBeenCalled();
    },
  );
  it("la préparation ne modifie rien, et une seule cible reste isolée", async () => {
    const h = harness(),
      p = await h.manager.preview(["two"]);
    expect(h.write).not.toHaveBeenCalled();
    const result = await h.manager.apply(p.id);
    expect(h.write.mock.calls.every(([a]: any) => a.input.id === "two")).toBe(
      true,
    );
    expect(result.cameras).toHaveLength(1);
    expect(
      result.cameras[0].rows.filter((r) => r.state === "verified").length,
    ).toBeGreaterThan(5);
    expect(
      result.cameras[0].rows.find((r) => r.id === "lightBrightness")?.state,
    ).toBe("manual");
    await expect(h.manager.apply(p.id)).rejects.toThrow("expirée");
  });
  it("continue les groupes indépendants après une relecture différente confirmée", async () => {
    const h = harness(),
      p = await h.manager.preview(["one", "two"]);
    h.write.mockResolvedValueOnce({
      sent: true,
      acknowledged: true,
      verified: false,
      message: "Relecture différente",
      issues: [
        {
          stage: "readback",
          code: "READBACK_MISMATCH",
          message: "Valeur différente",
        },
      ],
    });
    const result = await h.manager.apply(p.id);
    expect(
      h.write.mock.calls.filter(([a]: any) => a.input.id === "one"),
    ).not.toHaveLength(1);
    expect(
      result.cameras[0].rows.find((r) => r.id === "brightness")?.state,
    ).toBe("failed");
    expect(result.cameras[0].rows.find((r) => r.id === "fps")?.state).toBe(
      "verified",
    );
    expect(result.cameras[1].rows.find((r) => r.id === "fps")?.state).toBe(
      "verified",
    );
  });
  it("refuse un profil ou un réseau modifié entre vérification et application", async () => {
    const h = harness(),
      p = await h.manager.preview(["one"]);
    await h.store.save(await h.store.read());
    await expect(h.manager.apply(p.id)).rejects.toThrow("changé");
    expect(h.write).not.toHaveBeenCalled();
    const p2 = await h.manager.preview(["one"]);
    h.changeNetwork();
    await expect(h.manager.apply(p2.id)).rejects.toThrow("changé");
  });
  it("ne bloque que le groupe vidéo quand sa configuration change après l’analyse", async () => {
    const h = harness(),
      p = await h.manager.preview(["one"]);
    h.data.get("one")!.video.data[0].config.rateControl.frameRateLimit = 12;
    const r = await h.manager.apply(p.id);
    expect(h.write).toHaveBeenCalled();
    expect(h.write.mock.calls.some(([a]: any) => a.method === "setVideo")).toBe(
      false,
    );
    expect(r.cameras[0].rows.find((r) => r.id === "fps")?.state).toBe(
      "skipped",
    );
    expect(r.cameras[0].rows.find((r) => r.id === "brightness")?.state).toBe(
      "verified",
    );
  });
  it("un changement de réseau pendant le lot empêche toute écriture suivante", async () => {
    const h = harness(),
      p = await h.manager.preview(["one", "two"]);
    h.write.mockImplementationOnce(async () => {
      h.changeNetwork();
      return { sent: true, acknowledged: true, verified: true, message: "OK" };
    });
    const r = await h.manager.apply(p.id);
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(r.cameras[1].rows.find((r) => r.id === "fps")?.state).toBe(
      "skipped",
    );
  });
  it("signale une caméra inaccessible sans la prétendre configurée", async () => {
    const h = harness();
    h.read.mockRejectedValueOnce(Error("Caméra inaccessible"));
    const p = await h.manager.preview(["one", "two"]);
    const r = await h.manager.apply(p.id);
    expect(r.cameras[0].error).toBe("Caméra inaccessible");
    expect(h.write.mock.calls.every(([a]: any) => a.input.id === "two")).toBe(
      true,
    );
  });
});
describe("Date et heure", () => {
  const xml =
    "<SystemDateAndTime><DateTimeType>Manual</DateTimeType><DaylightSavings>true</DaylightSavings><TimeZone><TZ>CET-1CEST,M3.5.0/2,M10.5.0/3</TZ></TimeZone><UTCDateTime><Time><Hour>12</Hour><Minute>34</Minute><Second>56</Second></Time><Date><Year>2026</Year><Month>10</Month><Day>21</Day></Date></UTCDateTime></SystemDateAndTime>";
  it("vérifie une vraie date UTC et rejette le repli silencieux sur l’heure locale", () => {
    expect(parseCameraClock(xml).at).toBe(Date.parse("2026-10-21T12:34:56Z"));
    expect(() =>
      parseCameraClock(xml.replaceAll("UTCDateTime", "LocalDateTime")),
    ).toThrow("UTC");
    expect(() =>
      parseCameraClock(xml.replace("<Month>10", "<Month>13")),
    ).toThrow("invalide");
  });
  it("utilise l’heure actuelle à l’envoi et les règles été/hiver de Paris", () => {
    const winter = new Date("2026-01-10T12:00:00Z"),
      summer = new Date("2026-07-10T12:00:00Z");
    expect(clockSettings("Europe/Paris", winter)).toMatchObject({
      dateTime: winter,
      daylightSavings: true,
    });
    expect(clockSettings("Europe/Paris", summer)).toMatchObject({
      dateTime: summer,
      daylightSavings: true,
    });
    expect(clockSettings("UTC", summer)).toMatchObject({
      timezone: "UTC0",
      daylightSavings: false,
    });
  });
});

// Exercise the service's actual send/readback path; no device or network involved.
import { CameraService } from "../src/main/service";
import { Diagnostics } from "../src/main/diagnostics";
import { cameraClockPayload } from "../src/main/camera-clock";
function clockService(wrongZone = false, normalized = false) {
  const d = detail(),
    guard: any = { onSuspend: () => {}, epoch: 0 };
  const service = new CameraService(
    guard,
    new Diagnostics(),
    { stop: async () => {} } as any,
    async () => true,
    async () => {},
    async () => "",
    {} as any,
  );
  let received = "";
  const conn: any = {
    camera: d.camera,
    writeAttempts: 0,
    cam: { timeShift: 1 },
    soap: vi.fn(async (action: string, body: string) => {
      if (action === "SetSystemDateAndTime") {
        received = body;
        conn.writeAttempts++;
        return "<SetSystemDateAndTimeResponse/>";
      }
      const settings = clockSettings("Europe/Paris");
      const payload = cameraClockPayload(settings).replaceAll("sz:", "tt:");
      return `<SystemDateAndTime>${wrongZone ? payload.replace(settings.timezone, "UTC0") : normalized ? payload.replace(settings.timezone, "CET-1CEST-2,M3.5.0/02:00:00,M10.5.0/03:00:00") : payload}</SystemDateAndTime>`;
    }),
  };
  service.connections.set(d.camera.id, conn);
  vi.spyOn(service, "approve").mockResolvedValue(conn);
  return { service, conn, id: d.camera.id, received: () => received };
}
it("synchronise une seule fois avec l’heure courante et vérifie UTC, fuseau et mode", async () => {
  const h = clockService();
  // IPC IDs are validated UUIDs.
  const id = "00000000-0000-4000-8000-000000000011";
  h.service.connections.set(id, h.conn);
  const result = await h.service.dispatch("syncCameraTime", {
    id,
    timezone: "Europe/Paris",
  });
  expect(result).toMatchObject({
    sent: true,
    verified: true,
    acknowledged: true,
  });
  expect(h.conn.writeAttempts).toBe(1);
  expect(h.received()).toContain("<sz:DateTimeType>Manual</sz:DateTimeType>");
  expect(h.conn.cam.timeShift).toBeGreaterThan(
    Date.now() - process.uptime() * 1000 - 2000,
  );
});
it("ne déclare pas la date conforme si la caméra a ignoré le fuseau", async () => {
  const h = clockService(true),
    id = "00000000-0000-4000-8000-000000000011";
  h.service.connections.set(id, h.conn);
  const result = await h.service.dispatch("syncCameraTime", {
    id,
    timezone: "Europe/Paris",
  });
  expect(result.verified).toBe(false);
  expect(h.conn.writeAttempts).toBe(1);
});
it("accepte la normalisation POSIX observée sur les caméras et vérifie en une seule relecture", async () => {
  const h = clockService(false, true),
    id = "00000000-0000-4000-8000-000000000011";
  h.service.connections.set(id, h.conn);
  const result = await h.service.dispatch("syncCameraTime", {
    id,
    timezone: "Europe/Paris",
  });
  expect(result.verified).toBe(true);
  expect(result.fields?.clockTimezone).toMatchObject({
    verified: true,
    observed: "CET-1CEST-2,M3.5.0/02:00:00,M10.5.0/03:00:00",
  });
  expect(h.conn.soap.mock.calls.map(([method]: any) => method)).toEqual([
    "GetSystemDateAndTime",
    "SetSystemDateAndTime",
    "GetSystemDateAndTime",
    "GetSystemDateAndTime",
  ]);
});
it("compare offsets et dates de transition sans accepter un fuseau approximatif", () => {
  const expected = clockSettings("Europe/Paris").timezone;
  expect(
    timezonesEquivalent(
      "CET-01:00CEST-02:00,M3.5.0/02:00:00,M10.5.0/03:00:00",
      expected,
    ),
  ).toBe(true);
  for (const value of [
    "UTC0",
    "CET-1",
    "CET-1CEST-3,M3.5.0/2,M10.5.0/3",
    "CET-1CEST,M3.4.0/2,M10.5.0/3",
    "CET-1CEST,M3.5.0/2,M10.5.0/2",
    "CET-1CEST,M3.5.0/02:60,M10.5.0/3",
  ])
    expect(timezonesEquivalent(value, expected)).toBe(false);
  expect(timezonesEquivalent("GMT+00:00", "UTC0")).toBe(true);
});

import { ProfileJournal } from "../src/main/profile-journal";
import { auditFields, fieldSupport } from "../src/shared/default-support";
import { compareFields, videoReadback } from "../src/main/write-verification";
import { defaultValueLabel } from "../src/shared/defaults";
import type { WriteResult } from "../src/shared/types";

describe("Audit et journal du profil", () => {
  it("couvre tous les champs sans filtre de modèle et distingue les standards à intégrer", () => {
    expect(auditFields().map((f) => f.id)).toEqual(
      defaultFields.map((f) => f.id),
    );
    expect(defaultFields).toHaveLength(52);
    expect(fieldSupport("awbMode").kind).toBe("implemented");
    expect(fieldSupport("awbGreen").kind).toBe("implemented");
    expect(fieldSupport("denoise3d").kind).toBe("implemented");
    const d = detail();
    d.image.data.options.extension = {
      extension: {
        extension: { defoggingOptions: { mode: ["OFF", "ON"], level: true } },
      },
    };
    expect(auditFields(d).find((f) => f.id === "defog")?.observation).toContain(
      "écriture non validée",
    );
    d.image = { state: "unverified", message: "Timeout" };
    expect(auditFields(d).find((f) => f.id === "defog")?.observation).toContain(
      "absence de support non démontrée",
    );
  });
  it("audite même les champs exclus, sans écriture, et conserve les erreurs de lecture", async () => {
    const h = harness();
    const p = await h.store.read();
    p.fields.brightness.included = false;
    await h.store.save(p);
    h.read.mockRejectedValueOnce(Error("Network timeout"));
    const r = await h.manager.audit(["one", "two"]);
    expect(h.write).not.toHaveBeenCalled();
    expect(r.kind).toBe("audit");
    expect(r.cameras[0].rows).toHaveLength(52);
    expect(r.cameras[0].rows[0].code).toBe("TIMEOUT");
    expect(
      r.audit?.[1].fields.find((f) => f.id === "brightness")?.observation,
    ).toContain("écriture non testée");
    expect(await h.manager.journal.get(r.id)).toEqual(r);
    expect((await h.manager.journal.list())[0].verified).toBe(0);
  });
  it("rejette une lecture après changement de réseau", async () => {
    const h = harness();
    h.read.mockImplementationOnce(async () => {
      h.changeNetwork();
      return detail();
    });
    const r = await h.manager.audit(["one"]);
    expect(r.cameras[0].rows.every((r) => r.code === "NETWORK_CHANGED")).toBe(
      true,
    );
    expect(h.write).not.toHaveBeenCalled();
  });
  it("enregistre les succès et échecs champ par champ dans un même groupe", async () => {
    const h = harness();
    h.data.get("one")!.image.data.settings.contrast = 0;
    const p = await h.manager.preview(["one", "two"]);
    h.write.mockResolvedValueOnce({
      sent: true,
      acknowledged: true,
      verified: false,
      message: "Relecture différente",
      fields: {
        brightness: { verified: true, observed: 128 },
        contrast: { verified: false, observed: 0 },
      },
      issues: [
        {
          stage: "readback",
          code: "READBACK_MISMATCH",
          message: "Relecture différente",
        },
      ],
    } as WriteResult);
    const r = await h.manager.apply(p.id),
      rows = r.cameras[0].rows;
    expect(rows.find((r) => r.id === "brightness")).toMatchObject({
      state: "verified",
      observed: 128,
      code: "VERIFIED",
      method: "setImage",
      sent: true,
    });
    expect(rows.find((r) => r.id === "contrast")).toMatchObject({
      state: "failed",
      observed: 0,
      code: "READBACK_MISMATCH",
    });
    expect(rows.find((r) => r.id === "fps")?.state).toBe("verified");
    expect(r.cameras[1].rows.find((r) => r.id === "fps")?.state).toBe(
      "verified",
    );
    expect((await h.manager.journal.get(r.id)).cameras).toEqual(r.cameras);
  });
  it("n’envoie rien si le journal initial ne peut pas être écrit", async () => {
    const h = harness();
    const p = await h.manager.preview(["one"]);
    vi.spyOn(h.manager.journal, "save").mockRejectedValue(
      Error("Disque plein"),
    );
    await expect(h.manager.apply(p.id)).rejects.toThrow("Disque plein");
    expect(h.write).not.toHaveBeenCalled();
  });
  it("arrête les nouvelles écritures si la sauvegarde après un groupe échoue", async () => {
    const h = harness();
    const p = await h.manager.preview(["one", "two"]);
    const save = h.manager.journal.save.bind(h.manager.journal);
    let calls = 0;
    vi.spyOn(h.manager.journal, "save").mockImplementation(async (r) => {
      if (++calls === 3) throw Error("Disque plein");
      return save(r);
    });
    const r = await h.manager.apply(p.id);
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(r.status).toBe("interrupted");
    expect(r.journalWarning).toContain("Disque plein");
    expect(r.cameras[1].rows.find((r) => r.id === "brightness")?.state).toBe(
      "skipped",
    );
  });
  it("migre uniquement le nom historique, sans toucher aux valeurs ni à la révision", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "quasar-migration-"));
    try {
      const file = path.join(dir, "profile.json"),
        p = initialDefaults();
      p.name = "Sezaam · référence MCA35";
      p.revision = 8;
      p.fields.fps.value = 17;
      await writeFile(file, JSON.stringify(p));
      const migrated = await new DefaultsStore(file).read();
      expect(migrated).toEqual({ ...p, name: "Sezaam" });
      p.name = "Mon parc";
      await writeFile(file, JSON.stringify(p));
      expect((await new DefaultsStore(file).read()).name).toBe("Mon parc");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("conserve zéro et isole une valeur absente d’une valeur relue différente", () => {
    expect(defaultValueLabel(0)).toBe("0");
    expect(
      compareFields({ brightness: 0, contrast: 128 }, { brightness: 0 }),
    ).toEqual({
      brightness: { verified: true, observed: 0 },
      contrast: { verified: false },
    });
    expect(
      videoReadback(
        { codec: "H264", fps: 25, bitrate: 5120 },
        {
          encoding: "H264",
          rateControl: { frameRateLimit: 25, bitrateLimit: 2048 },
        },
      ),
    ).toMatchObject({
      codec: { verified: true },
      fps: { verified: true },
      bitrate: { verified: false, observed: 2048 },
    });
  });
  it("conserve les causes d’envoi et de relecture sans les identifiants", async () => {
    const h = clockService();
    h.service.log.secrets.add("private-test-password");
    const r = await h.service.writeAndVerify(
      h.id,
      async () => {
        throw Error("401 password=private-test-password");
      },
      async () => {
        throw Error("Network timeout");
      },
    );
    expect(r.issues?.map((i) => i.code)).toEqual([
      "AUTHENTICATION_FAILED",
      "TIMEOUT",
    ]);
    expect(JSON.stringify(r)).not.toContain("private-test-password");
    expect(r.verified).toBe(false);
  });
});

it("accepte une première identité en audit, mais signale une identité déjà connue qui change", async () => {
  const h = harness(),
    initial = h.data.get("one")!;
  initial.camera.serial = undefined;
  h.read.mockResolvedValueOnce(detail());
  const first = await h.manager.audit(["one"]);
  expect(first.cameras[0].error).toBeUndefined();
  initial.camera.serial = "SERIAL-one";
  const changed = detail();
  changed.camera.serial = "DIFFERENT";
  h.read.mockResolvedValueOnce(changed);
  const second = await h.manager.audit(["one"]);
  expect(second.cameras[0].rows[0].code).toBe("IDENTITY_CHANGED");
  expect(h.write).not.toHaveBeenCalled();
});
it("ne confond pas une identité absente avec une identité modifiée", async () => {
  const h = harness();
  h.data.get("one")!.camera.serial = undefined;
  const r = await h.manager.audit(["one"]);
  expect(r.cameras[0].rows[0].code).toBe("IDENTITY_UNVERIFIED");
});

it("classe une relecture indisponible séparément d’une valeur différente", async () => {
  const h = clockService();
  const unavailable = await h.service.writeAndVerify(
    h.id,
    async () => {},
    async () => {
      throw Error("Encodeur absent de la relecture vidéo.");
    },
  );
  expect(unavailable.issues?.[0].code).toBe("READBACK_FAILED");
  const mismatch = await h.service.writeAndVerify(
    h.id,
    async () => {},
    async () => false,
  );
  expect(mismatch.issues?.[0].code).toBe("READBACK_MISMATCH");
});

it("calcule le décalage de Paris en été, en hiver et pendant la transition", () => {
  for (const [at, timezone] of [
    ["2026-07-10T12:00:00Z", "CEST-2"],
    ["2026-10-25T00:59:59Z", "CEST-2"],
    ["2026-10-25T01:00:00Z", "CET-1"],
    ["2026-12-10T12:00:00Z", "CET-1"],
  ]) {
    expect(fixedClockSettings("Europe/Paris", new Date(at))).toMatchObject({
      timezone,
      daylightSavings: false,
      dateTime: new Date(at),
    });
  }
});

it("n’ignore les règles DST conservées par le firmware que si elles sont désactivées", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  const got = {
    at: +now,
    mode: "Manual",
    daylightSavings: false,
    timezone: clockSettings("Europe/Paris").timezone,
    localAt: +now + 3600000,
  };
  expect(
    clockTimezoneMatches(got, fixedClockSettings("Europe/Paris", now)),
  ).toBe(true);
  expect(
    clockTimezoneMatches(
      { ...got, daylightSavings: true },
      fixedClockSettings("Europe/Paris", now),
    ),
  ).toBe(false);
  expect(
    clockTimezoneMatches(
      { ...got, timezone: "CET-2" },
      fixedClockSettings("Europe/Paris", now),
    ),
  ).toBe(false);
  expect(
    clockTimezoneMatches(
      { ...got, timezone: "CET-1CEST,invalid" },
      fixedClockSettings("Europe/Paris", now),
    ),
  ).toBe(false);
  expect(localClockMatches(got, "Europe/Paris")).toBe(true);
  expect(
    localClockMatches({ ...got, localAt: +now + 7200000 }, "Europe/Paris"),
  ).toBe(false);
  expect(
    hasDSTClockError(
      { ...got, daylightSavings: true, localAt: +now + 7200000 },
      clockSettings("Europe/Paris", now),
      +now,
    ),
  ).toBe(true);
});

function faultyDSTClock({
  skew = 3600000,
  badLocal = false,
  lostAck = false,
} = {}) {
  const h = clockService();
  const id = "00000000-0000-4000-8000-000000000011";
  h.service.connections.set(id, h.conn);
  let settings = clockSettings("Europe/Paris");
  h.conn.soap = vi.fn(async (method: string, body: string) => {
    if (method === "SetSystemDateAndTime") {
      h.conn.writeAttempts++;
      const sent = parseCameraClock(
        `<SystemDateAndTime>${body}</SystemDateAndTime>`,
      );
      settings = {
        dateTimeType: "Manual",
        dateTime: new Date(sent.at),
        timezone: sent.timezone,
        daylightSavings: sent.daylightSavings,
      };
      if (lostAck) throw Error("Network timeout après envoi");
      return "<SetSystemDateAndTimeResponse/>";
    }
    const at = Date.now() + (settings.daylightSavings ? skew : 0);
    const utc = cameraClockPayload({ ...settings, dateTime: new Date(at) });
    const offset =
      fixedClockSettings("Europe/Paris").timezone === "CET-1"
        ? 3600000
        : 7200000;
    const local = cameraClockPayload({
      ...settings,
      dateTime: new Date(at + offset + (badLocal ? 3600000 : 0)),
    })
      .match(/<sz:UTCDateTime[\s\S]*<\/sz:UTCDateTime>/)![0]
      .replaceAll("UTCDateTime", "LocalDateTime");
    return `<SystemDateAndTime>${utc}${local}</SystemDateAndTime>`;
  });
  return { ...h, id };
}

it("corrige une avance UTC d’une heure avec une seule écriture de compatibilité puis vérifie UTC et heure locale", async () => {
  const h = faultyDSTClock();
  const result = await h.service.dispatch("syncCameraTime", {
    id: h.id,
    timezone: "Europe/Paris",
  });
  expect(result.verified).toBe(true);
  expect(h.conn.writeAttempts).toBe(2);
  expect(result.fields?.clockTimezone.observed).toContain("resynchronisation");
  expect(h.service.uncertain.has(h.id)).toBe(false);
});

it("ne lance pas de correction DST sur une erreur quelconque ou un accusé perdu", async () => {
  for (const options of [{ skew: 7200000 }, { lostAck: true }]) {
    const h = faultyDSTClock(options);
    const result = await h.service.dispatch("syncCameraTime", {
      id: h.id,
      timezone: "Europe/Paris",
    });
    expect(result.verified).toBe(false);
    expect(h.conn.writeAttempts).toBe(1);
  }
}, 15000);

it("ne valide pas le mode de compatibilité si l’heure locale reste fausse", async () => {
  const h = faultyDSTClock({ badLocal: true });
  const result = await h.service.dispatch("syncCameraTime", {
    id: h.id,
    timezone: "Europe/Paris",
  });
  expect(h.conn.writeAttempts).toBe(2);
  expect(result.verified).toBe(false);
  expect(result.fields?.syncTime.verified).toBe(false);
});

it("conserve la cause précise d’un échec au lieu de la remplacer par un message générique", async () => {
  const h = harness();
  h.data.get("one")!.image.data.settings.contrast = 0;
  const plan = await h.manager.preview(["one"]);
  h.write.mockResolvedValueOnce({
    sent: true,
    acknowledged: true,
    verified: false,
    message: "Échec générique",
    fields: {
      contrast: {
        verified: false,
        observed: 0,
        issues: [
          {
            stage: "readback",
            code: "READBACK_MISMATCH",
            message: "Le contraste est resté à 0 malgré la commande acceptée.",
          },
        ],
      },
    },
  });
  const result = await h.manager.apply(plan.id);
  expect(result.cameras[0].rows.find((r) => r.id === "contrast")?.message).toBe(
    "Le contraste est resté à 0 malgré la commande acceptée.",
  );
});

it("un timeout d’écriture arrête la caméra sans renvoyer la commande", async () => {
  const h = harness(),
    plan = await h.manager.preview(["one"]);
  h.write.mockResolvedValueOnce({
    sent: true,
    acknowledged: false,
    verified: false,
    message: "Timeout",
    issues: [{ stage: "send", code: "TIMEOUT", message: "Timeout" }],
  });
  const result = await h.manager.apply(plan.id);
  expect(h.write).toHaveBeenCalledTimes(1);
  expect(result.cameras[0].rows.find((row) => row.id === "fps")?.state).toBe(
    "skipped",
  );
});

it("un groupe devenu conforme est conservé sans empêcher les autres groupes", async () => {
  const h = harness(),
    plan = await h.manager.preview(["one"]);
  const profile = await h.store.read();
  const image = h.data.get("one")!.image.data;
  for (const id of ["brightness", "colorSaturation", "contrast", "sharpness"])
    image.settings[id] = profile.fields[id].value;
  const result = await h.manager.apply(plan.id);
  expect(
    h.write.mock.calls.some(([action]: any) => action.method === "setImage"),
  ).toBe(false);
  expect(
    result.cameras[0].rows.find((row) => row.id === "brightness")?.state,
  ).toBe("same");
  expect(result.cameras[0].rows.find((row) => row.id === "fps")?.state).toBe(
    "verified",
  );
});

it("la reprise d’un groupe indépendant revérifie l’identité avant de lever l’incertitude", async () => {
  const service: any = Object.create(CameraService.prototype);
  const camera = detail().camera;
  const identity = vi.fn(async () => ({ ...camera }));
  Object.assign(service, {
    guard: { epoch: 1, assert: async () => {}, ensureEpoch: () => {} },
    camera: () => camera,
    connection: async () => ({ identity }),
    uncertain: new Set([camera.id]),
  });
  expect(await service.continueProfileAfterFailure(camera)).toBe(true);
  expect(service.uncertain.has(camera.id)).toBe(false);
  service.uncertain.add(camera.id);
  identity.mockResolvedValue({ ...camera, serial: "OTHER" });
  expect(await service.continueProfileAfterFailure(camera)).toBe(false);
  expect(service.uncertain.has(camera.id)).toBe(true);
});
