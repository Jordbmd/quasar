import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LanguagePreference } from "../src/main/language";
import { IpcController } from "../src/main/ipc-controller";
import { Diagnostics } from "../src/main/diagnostics";
import { CameraService } from "../src/main/service";
import { getLanguage, setLanguage, t } from "../src/shared/i18n";
import { initialOSD } from "../src/renderer/OSDFields";
import { CameraCard } from "../src/renderer/design-system/camera";
import { displayDefaultValue, displayValue } from "../src/renderer/format";

afterEach(() => setLanguage("fr"));
it("keeps identity values and cancellation intact in English native confirmation text", async () => {
  setLanguage("en");
  const camera = {
    id: "test",
    ip: "192.0.2.8",
    model: "Paramètres",
    serial: "Caméra",
    mac: "00:00:00:00:00:08",
  };
  const confirm = vi.fn(async (_message: string) => false);
  const writeGuard = vi.fn(async () => ({ camera }));
  const service = Object.assign(Object.create(CameraService.prototype), {
    writeGuard,
    conflict: async () => {},
    guard: { epoch: 1, ensureEpoch: vi.fn() },
    confirm,
  }) as CameraService;
  await expect(
    service.approve("test", "Appliquer les réglages du profil via l’API web."),
  ).rejects.toThrow("Opération annulée.");
  expect(confirm.mock.calls[0]?.[0]).toContain("Paramètres · 192.0.2.8");
  expect(confirm.mock.calls[0]?.[0]).toContain("Serial: Caméra");
  expect(confirm.mock.calls[0]?.[0]).toContain(
    "Apply profile settings through the web API.",
  );
  expect(confirm.mock.calls[0]?.[0]).toContain(
    "This action changes only this camera. Continue?",
  );
  expect(writeGuard).toHaveBeenCalledOnce();
});
it("persists only a validated language, serialises concurrent writes and bypasses camera operations", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "quasar-language-"));
  try {
    const preference = new LanguagePreference(directory);
    const dispatch = vi.fn();
    const ipc = new IpcController(
      { dispatch } as unknown as CameraService,
      new Diagnostics(),
      () => {},
      (language) => preference.save(language),
    );
    for (const input of [
      { language: "de" },
      { language: "en", token: "secret" },
      "en",
      null,
    ]) {
      expect(await ipc.call("setLanguage", input)).toMatchObject({
        ok: false,
        code: "INVALID_REQUEST",
      });
    }
    expect(getLanguage()).toBe("fr");
    await Promise.all([
      ipc.call("setLanguage", { language: "en" }),
      ipc.call("setLanguage", { language: "fr" }),
      ipc.call("setLanguage", { language: "en" }),
    ]);
    setLanguage("fr");
    expect(await new LanguagePreference(directory).load()).toBe("en");
    expect(
      JSON.parse(await readFile(path.join(directory, "language.json"), "utf8")),
    ).toBe("en");
    expect(dispatch).not.toHaveBeenCalled();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it("translates authored labels while retaining camera identity, profile values and OSD text", () => {
  setLanguage("en");
  const html = renderToStaticMarkup(
    React.createElement(CameraCard, {
      camera: {
        id: "simulated",
        ip: "192.0.2.5",
        name: "Paramètres",
        model: "Caméras",
        port: 80,
        path: "/onvif/device_service",
        ambiguous: false,
        status: "Connectée · lecture seule",
      },
      onSelect: () => {},
    }),
  );
  expect(html).toContain("Paramètres");
  expect(html).toContain("Caméras");
  expect(html).toContain("192.0.2.5");
  expect(html).toContain("Connected");
  expect(displayValue("Paramètres")).toBe("Paramètres");
  expect(t("constructor")).toBe("constructor");
  expect(displayDefaultValue("Activé")).toBe("Activé");
  expect(displayDefaultValue(true)).toBe("Enabled");
  expect(
    initialOSD({
      textTypes: ["Plain"],
      positions: ["UpperLeft"],
      types: [],
      dateFormats: [],
      timeFormats: [],
      maximum: {},
    }).text,
  ).toBe("Caméra");
  expect(t("Série : {0} · MAC : {1}", "Caméra", "00:00:00:00:00:01")).toBe(
    "Serial: Caméra · MAC: 00:00:00:00:00:01",
  );
});
