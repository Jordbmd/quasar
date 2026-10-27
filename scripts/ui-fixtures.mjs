import { build } from "esbuild";
// Test harness only: simulated devices never ship with the application.
import { chromium } from "playwright";
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { WebSocketServer } from "ws";
import assert from "node:assert/strict";
import { checkSettingsHydration } from "./settings-drafts-test.mjs";
const compiledDefaults = await build({
  stdin: {
    contents:
      'export * from "./src/shared/defaults"; export * from "./src/shared/default-support";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { initialDefaults, auditFields } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiledDefaults.outputFiles[0].text).toString("base64")
);
const require = createRequire(import.meta.url),
  root = path.resolve("dist/renderer");
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://127.0.0.1").pathname,
    );
    const file = path.resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!file.startsWith(root + path.sep)) throw Error();
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".woff2")
            ? "font/woff2"
            : file.endsWith(".svg")
              ? "image/svg+xml"
              : file.endsWith(".ttf")
                ? "font/ttf"
                : "text/html",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const wss = new WebSocketServer({ server, path: "/video/test" });
let failVideo = true;
wss.on(
  "connection",
  (ws) =>
    failVideo &&
    ws.send(
      JSON.stringify({
        type: "error",
        value: "SIMULATION : flux indisponible",
      }),
    ),
);
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1448, height: 1086 },
  });
  await context.addInitScript(
    ({ port, defaults, auditCatalog }) => {
      let savedDefaults = defaults;
      let defaultsPlan;
      let resetPlan;
      const profileRuns = [];
      localStorage.setItem("sezaam-theme", "dark");
      localStorage.setItem(
        "quasar-preferences",
        JSON.stringify({
          autoplay: false,
          lowLatency: true,
          previewQuality: "light",
        }),
      );
      const calls = [];
      const cameras = Array.from({ length: 180 }, (_, i) => ({
        id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        ip: `10.79.42.${i + 11}`,
        port: 80,
        path: "/onvif/device_service",
        name: `TEST — Caméra ${String(i + 1).padStart(3, "0")}`,
        model: ["TEST-A", "TEST-B", "TEST-C", "TEST-D"][i % 4],
        firmware: "SIMULATEUR 1.0",
        serial: "TEST-" + i,
        mac: "aa:bb:cc:dd:ee:" + i.toString(16).padStart(2, "0"),
        status: "Découverte · non authentifiée",
        ambiguous: false,
      }));
      const available = (data) => ({ state: "available", data });
      const details = new Map();
      const detailListeners = new Set();
      const defaultsListeners = new Set();
      const addressListeners = new Set();
      let active = false;
      let sessionUsername = "";
      const session = () => ({
        active,
        username: active ? sessionUsername : undefined,
        connected: cameras.filter((c) => c.status.startsWith("Connectée"))
          .length,
        total: cameras.length,
        failures: cameras
          .filter((c) => c.connectionError)
          .map((c) => ({ id: c.id, ip: c.ip, message: c.connectionError })),
      });
      const reports = [];
      const makeDetail = (c) => ({
        camera: c,
        network: available([
          {
            $: { token: "eth1" },
            info: { hwAddress: c.mac },
            IPv4: {
              config: {
                DHCP: false,
                manual: [{ address: c.ip, prefixLength: 24 }],
              },
            },
          },
        ]),
        gateway: available({ IPv4Address: "10.79.42.254" }),
        dns: available({
          fromDHCP: false,
          DNSManual: [{ IPv4Address: "10.79.42.254", type: "IPv4" }],
        }),
        video: available([
          {
            profile: "main",
            name: "Flux principal (TEST)",
            config: {
              $: { token: "enc1" },
              encoding: "H264",
              resolution: { width: 1920, height: 1080 },
              rateControl: { frameRateLimit: 25, bitrateLimit: 2048 },
              quality: 4,
              H264: { govLength: 50 },
            },
            options: available({
              H264: {
                resolutionsAvailable: [
                  { width: 1920, height: 1080 },
                  { width: 1280, height: 720 },
                ],
                frameRateRange: { min: 1, max: 30 },
                bitrateRange: { min: 128, max: 8192 },
                govLengthRange: { min: 1, max: 100 },
              },
              qualityRange: { min: 1, max: 6 },
            }),
          },
        ]),
        image: { state: "unverified" },
        capabilities: available({}),
        lighting: { state: "unverified" },
        profiles: [{ $: { token: "main" }, name: "Flux principal (TEST)" }],
        osd: available({
          options: [
            {
              source: "source1",
              result: available({
                types: ["Text"],
                positions: [
                  "UpperLeft",
                  "UpperRight",
                  "LowerLeft",
                  "LowerRight",
                  "Custom",
                ],
                textTypes: ["Plain", "DateAndTime"],
                dateFormats: ["dd/MM/yyyy", "yyyy-MM-dd"],
                timeFormats: ["HH:mm:ss", "hh:mm:ss tt"],
                fontSize: { min: 10, max: 36 },
                maximum: { Total: 4 },
              }),
            },
          ],
          settings: [
            {
              token: "clock",
              source: "source1",
              type: "Text",
              textType: "DateAndTime",
              text: "",
              position: "UpperRight",
              dateFormat: "dd/MM/yyyy",
              timeFormat: "HH:mm:ss",
            },
            {
              token: "name",
              source: "source1",
              textType: "Plain",
              type: "Text",
              text: "Atelier — TEST",
              position: "LowerLeft",
            },
          ],
        }),
        osdRestoreAvailable: false,
      });
      const state = () => ({
        platform: "darwin",
        arch: "arm64",
        network: {
          adapter: {
            id: "en-test",
            service: "Ethernet — SIMULATION",
            label: "Ethernet",
            kind: "ethernet",
            enabled: true,
            link: true,
            address: "10.79.42.1",
            mask: "255.255.255.0",
            router: "",
            dns: [],
            mode: "dhcp",
            mtu: 1500,
            media: "SIMULATION",
            mac: "aa:00:00:00:00:01",
          },
          ready: true,
          reason: "SIMULATION",
          overlaps: [],
        },
        cameras,
        session: session(),
        reports,
        logs: [
          {
            at: new Date().toISOString(),
            level: "info",
            event: "Simulation automatisée",
            detail: "Aucune caméra réelle utilisée.",
          },
        ],
        videoReady: true,
      });
      window.__sezaamTest = {
        calls,
        detailFixture: () => makeDetail(cameras[0]),
        emitBatch: (kind, update) => {
          for (const fn of kind === "address"
            ? addressListeners
            : defaultsListeners)
            fn(update);
        },
        failSecond: true,
        webOSDFixture: () => {
          const id = cameras[0].id;
          const d = details.get(id) || makeDetail(cameras[0]);
          d.osd = available({
            strategy: "web",
            web: {
              enabled: false,
              title: "Camera",
              titlePosition: "topLeft",
              timePosition: "bottomRight",
            },
          });
          details.set(id, d);
        },
        network: () => structuredClone(state().network),
      };
      window.sezaam = {
        onDefaultsProgress: (fn) => {
          defaultsListeners.add(fn);
          return () => defaultsListeners.delete(fn);
        },
        onAddressProgress: (fn) => {
          addressListeners.add(fn);
          return () => addressListeners.delete(fn);
        },
        onCameraDetail: (fn) => {
          detailListeners.add(fn);
          return () => detailListeners.delete(fn);
        },
        onNetworkChanged: (fn) => {
          window.__sezaamTest.networkChanged = fn;
          return () => {
            delete window.__sezaamTest.networkChanged;
          };
        },
        onInvalidated: () => () => {},
        call: async (method, v) => {
          calls.push({ method, input: v });
          if (window.__sezaamTest.holdBatch === method) {
            await new Promise((resolve, reject) => {
              window.__sezaamTest.finishBatch = (error) =>
                error ? reject(new Error(error)) : resolve();
            });
            window.__sezaamTest.holdBatch = undefined;
          }
          if (method === "previewFactoryReset") {
            resetPlan = {
              id: "reset-fixture",
              createdAt: new Date().toISOString(),
              phase: "preview",
              rows: cameras.slice(0, 3).map((camera, i) => ({
                camera,
                state: i === 0 ? "blocked" : "ready",
                message:
                  i === 0
                    ? "SIMULATION — conflit IP"
                    : "SIMULATION — identité vérifiée",
              })),
            };
            return structuredClone(resetPlan);
          }
          if (method === "applyFactoryReset") {
            if (v.confirmation !== "EFFACER")
              throw Error("Confirmation absente");
            return {
              ...resetPlan,
              phase: "complete",
              rows: resetPlan.rows.map((r) =>
                r.state === "ready"
                  ? {
                      ...r,
                      state: "accepted",
                      message:
                        "SIMULATION — commande acceptée, état d’usine à contrôler",
                    }
                  : r,
              ),
            };
          }
          if (method === "previewAddresses")
            return {
              id: "address-fixture",
              createdAt: new Date().toISOString(),
              rows: cameras.slice(0, 3).map((c, i) => ({
                id: c.id,
                name: c.name,
                identity: c.mac,
                from: c.ip,
                to: `192.168.1.${v.start + i + 10}`,
                locker: v.start + i,
                state: i === 0 ? "blocked" : "ready",
                message:
                  i === 0 ? "SIMULATION — IP partagée" : "SIMULATION — prête",
              })),
            };
          if (method === "applyAddresses")
            return {
              id: "address-fixture",
              createdAt: new Date().toISOString(),
              rows: cameras.slice(0, 3).map((c, i) => ({
                id: c.id,
                name: c.name,
                identity: c.mac,
                from: c.ip,
                to: `192.168.1.${i + 11}`,
                locker: i + 1,
                state: i === 0 ? "blocked" : "verified",
                message:
                  i === 0
                    ? "SIMULATION — IP partagée"
                    : "SIMULATION — adresse vérifiée",
              })),
            };
          if (method === "getDefaults") return structuredClone(savedDefaults);
          if (method === "saveDefaults") {
            savedDefaults = {
              ...structuredClone(v),
              revision: savedDefaults.revision + 1,
            };
            return savedDefaults;
          }
          if (method === "previewDefaults") {
            defaultsPlan = {
              id: "fixture-plan",
              name: savedDefaults.name,
              revision: savedDefaults.revision,
              createdAt: new Date().toISOString(),
              cameras: v.ids.map((id, cameraIndex) => ({
                camera: cameras.find((c) => c.id === id),
                rows: [
                  ...(v.ids.length > 1 && cameraIndex === 1
                    ? [
                        {
                          id: "brightness",
                          label: "Luminosité",
                          value: 128,
                          state: "blocked",
                          code: "TIMEOUT",
                          message: "SIMULATION — lecture impossible",
                        },
                        {
                          id: "resolution",
                          label: "Résolution",
                          value: "3MP",
                          before: "2304X1296",
                          state: "blocked",
                          code: "VALUE_NOT_SUPPORTED",
                          message:
                            "SIMULATION — résolution non proposée par la caméra",
                        },
                        {
                          id: "contrast",
                          label: "Contraste",
                          value: 128,
                          before: "128",
                          state: "same",
                          message: "SIMULATION — déjà conforme",
                        },
                      ]
                    : []),
                  {
                    id: "fps",
                    label: "Cadence",
                    value: savedDefaults.fields.fps.value,
                    before: "25",
                    state: "ready",
                    message: "SIMULATION — valeur compatible",
                  },
                  {
                    id: "lightMode",
                    label: "Mode d’éclairage",
                    value: "Pure white light",
                    state: "manual",
                    message: "À effectuer dans l’interface constructeur",
                  },
                ],
              })),
            };
            return structuredClone(defaultsPlan);
          }
          if (method === "applyDefaults") {
            const report = {
              ...structuredClone(defaultsPlan),
              kind: "apply",
              status: "complete",
              startedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              cameras: defaultsPlan.cameras.map((c) => ({
                ...c,
                rows: c.rows.map((r) => ({
                  ...r,
                  state: r.state === "ready" ? "verified" : r.state,
                })),
              })),
            };
            profileRuns.push(report);
            return report;
          }
          if (method === "auditDefaults") {
            const now = new Date().toISOString();
            const report = {
              id: "fixture-audit",
              name: savedDefaults.name,
              revision: savedDefaults.revision,
              createdAt: now,
              startedAt: now,
              updatedAt: now,
              kind: "audit",
              status: "complete",
              cameras: v.ids.map((id) => ({
                camera: cameras.find((c) => c.id === id),
                rows: auditCatalog.map((f) => ({
                  id: f.id,
                  label: f.label,
                  value: savedDefaults.fields[f.id].value,
                  state:
                    f.id === "brightness"
                      ? "blocked"
                      : f.kind === "implemented"
                        ? "ready"
                        : "manual",
                  message: "SIMULATION — aucun essai d’écriture",
                  code:
                    f.id === "brightness"
                      ? "TIMEOUT"
                      : f.kind === "implemented"
                        ? undefined
                        : "NOT_IMPLEMENTED",
                })),
              })),
              audit: v.ids.map((cameraId) => ({
                cameraId,
                fields: auditCatalog,
              })),
            };
            profileRuns.push(report);
            return structuredClone(report);
          }
          if (method === "listDefaultsRuns")
            return profileRuns
              .map((r) => ({
                ...r,
                cameras: r.cameras.length,
                verified: r.cameras
                  .flatMap((c) => c.rows)
                  .filter((r) => r.state === "verified").length,
                failed: 0,
                blocked: 0,
                pending: 0,
              }))
              .reverse();
          if (method === "getDefaultsRun")
            return structuredClone(profileRuns.find((r) => r.id === v.id));
          if (method === "exportDefaultsRun")
            return "SIMULATION — rapport JSON exporté";
          if (method === "state") return structuredClone(state());
          if (method === "previewProfiles")
            return window.__sezaamTest.emptyPreviewProfiles?.[v.id]
              ? []
              : makeDetail(cameras.find((c) => c.id === v.id)).profiles;
          if (method === "stopVideo") return;
          if (method === "cancelCameraRead") return;
          if (method === "discover") return cameras;
          if (method === "connectSession" || method === "retryConnections") {
            if (method === "connectSession") {
              active = true;
              sessionUsername = v.username;
              details.clear();
            }
            for (const [i, c] of cameras.entries()) {
              delete c.connectionError;
              if (i === 1 && window.__sezaamTest.failSecond) {
                c.status = "Erreur de connexion";
                c.connectionError = "SIMULATION — identifiants refusés";
              } else c.status = "Connectée · lecture seule";
            }
            return structuredClone(session());
          }
          if (method === "disconnectSession") {
            active = false;
            details.clear();
            for (const c of cameras) {
              c.status = "Découverte · non authentifiée";
              delete c.connectionError;
            }
            return;
          }
          if (method === "selectCamera" || method === "readCamera") {
            const c = cameras.find((c) => c.id === v.id);
            if (!active || c.connectionError)
              throw Error(c.connectionError || "Session fermée");
            if (window.__sezaamTest.progressive?.[v.id]) {
              const partial = makeDetail(c);
              partial.osd = { state: "loading", message: "Lecture en cours…" };
              partial.loading = true;
              for (const fn of detailListeners)
                fn({
                  requestId: v.requestId,
                  detail: structuredClone(partial),
                });
            }
            await new Promise((r) =>
              setTimeout(r, window.__sezaamTest.readDelay?.[v.id] ?? 100),
            );
            if (window.__sezaamTest.readErrors?.[v.id]) {
              // A delayed notification can cross the cancellation boundary.
              for (const fn of detailListeners)
                fn({ requestId: v.requestId, detail: makeDetail(c) });
            }
            if (window.__sezaamTest.readErrors?.[v.id])
              throw Error("SIMULATION — ancienne lecture échouée");
            if (!details.has(v.id)) details.set(v.id, makeDetail(c));
            return structuredClone(details.get(v.id));
          }
          if (method === "setWebOSD") {
            details.get(v.id).osd.data.web = structuredClone(v.values);
            return {
              sent: true,
              acknowledged: true,
              verified: true,
              message: "SIMULATION : OSD web relu",
            };
          }
          if (method === "setVideo") {
            const d = details.get(v.id);
            const cfg = d.video.data[0].config;
            cfg.resolution = { width: v.width, height: v.height };
            cfg.rateControl.frameRateLimit = v.fps;
            if (v.bitrate !== undefined)
              cfg.rateControl.bitrateLimit = v.bitrate;
            return {
              sent: true,
              acknowledged: true,
              verified: true,
              message: "SIMULATION : vidéo vérifiée",
            };
          }
          if (method === "disableOSD") {
            const d = details.get(v.id);
            d.osdBackup = structuredClone(d.osd.data.settings);
            d.osd.data.settings = d.osd.data.settings.filter(
              (x) => !v.tokens.includes(x.token),
            );
            d.osdRestoreAvailable = true;
            return {
              sent: true,
              acknowledged: true,
              verified: true,
              message: "SIMULATION : OSD supprimés et relus",
            };
          }
          if (method === "createOSD" || method === "restoreOSD") {
            const d = details.get(v.id);
            if (method === "restoreOSD")
              d.osd.data.settings = structuredClone(d.osdBackup);
            else
              d.osd.data.settings.push({
                ...v,
                token: "created",
                type: "Text",
              });
            return {
              sent: true,
              acknowledged: true,
              verified: true,
              message: "SIMULATION : OSD relu",
            };
          }
          if (method === "setOSD") {
            Object.assign(
              details
                .get(v.id)
                .osd.data.settings.find((x) => x.token === v.token),
              v,
            );
            return {
              sent: true,
              acknowledged: true,
              verified: true,
              message: "SIMULATION : texte relu",
            };
          }
          if (method === "startVideo")
            return { url: `ws://127.0.0.1:${port}/video/test` };
          if (method === "addCamera")
            throw Error("Adresse IPv4 invalide (test automatisé).");
          if (method === "diagnose") {
            const r = {
              cameraId: v.id,
              ip: cameras.find((c) => c.id === v.id).ip,
              at: new Date().toISOString(),
              checks: [
                {
                  key: "network",
                  label: "Accessibilité réseau",
                  state: "passed",
                  detail: "SIMULATION — connexion de test",
                },
                {
                  key: "osd",
                  label: "Configuration OSD",
                  state: "unsupported",
                  detail: "SIMULATION — non prise en charge",
                },
                {
                  key: "video",
                  label: "Flux vidéo",
                  state: "failed",
                  detail: "SIMULATION — délai dépassé",
                },
                {
                  key: "firmware",
                  label: "Firmware",
                  state: "untested",
                  detail: "SIMULATION — non testé",
                },
              ],
            };
            reports.push(r);
            return r;
          }
          if (method === "copyLogs") return;
          throw Error("Méthode non simulée : " + method);
        },
      };
    },
    { port, defaults: initialDefaults(), auditCatalog: auditFields() },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator(".operation").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".network-strip select").count(), 0);
  await page.evaluate(() => {
    const network = window.__sezaamTest.network();
    network.adapter.address = "169.254.254.50";
    network.adapter.mask = "255.255.0.0";
    network.warning =
      "SIMULATION — aucune adresse DHCP reçue. Vérifiez le port LAN du routeur.";
    window.__sezaamTest.networkChanged(network);
  });
  await page
    .getByText("Adressage Ethernet à vérifier", { exact: true })
    .waitFor();

  assert.equal(
    await page
      .getByRole("button", { name: "Relancer la détection", exact: true })
      .isEnabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Réseau Ethernet", exact: true })
    .click();
  await page.getByText("Adresse IPv4 locale", { exact: true }).waitFor();
  assert.equal(await page.locator(".network-meta .status.warning").count(), 1);
  await page.evaluate(() =>
    window.__sezaamTest.networkChanged({
      ready: false,
      overlaps: [],
      reason: "TEST : hub débranché",
    }),
  );
  await page.getByText("TEST : hub débranché", { exact: true }).waitFor();
  await page.getByRole("button", { name: /Caméras Configuration/ }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Relancer la détection", exact: true })
      .isDisabled(),
    true,
  );
  await page.evaluate(() =>
    window.__sezaamTest.networkChanged(window.__sezaamTest.network()),
  );
  await page.getByText("Ethernet disponible", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Relancer la détection", exact: true })
      .isEnabled(),
    true,
  );
  await page.evaluate(() => {
    const b = document.createElement("div");
    b.textContent = "SIMULATION — TEST AUTOMATISÉ";
    b.style.cssText =
      "position:fixed;top:22px;left:480px;z-index:99;background:#fff;color:#000;padding:6px 10px;font-size:11px;border:1px solid #000";
    document.body.append(b);
  });
  assert.equal(await page.locator(".camera-row").count(), 180);
  assert.equal(await page.locator(".camera-thumb").count(), 0);
  assert.equal(
    await page.locator(".camera-row code").first().textContent(),
    "10.79.42.11",
  );
  await page.getByLabel("Trier les caméras").selectOption("ip-desc");
  assert.equal(
    await page.locator(".camera-row code").first().textContent(),
    "10.79.42.190",
  );
  await page.getByLabel("Trier les caméras").selectOption("ip-asc");
  await page
    .getByRole("textbox", { name: "Rechercher une caméra" })
    .fill("Caméra 001");
  assert.equal(await page.locator(".camera-row").count(), 1);
  await page.locator(".camera-row").click();
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Connexion à l’application" })
    .waitFor();
  await page.getByLabel("Mot de passe", { exact: true }).fill("TEST_SECRET");
  await page
    .getByRole("button", { name: "Connecter les caméras", exact: true })
    .click();
  await page.locator(".operation").waitFor({ state: "hidden" });
  await page
    .getByRole("button", {
      name: "Gérer la connexion aux caméras",
      exact: true,
    })
    .waitFor();
  assert.equal(await page.locator('input[type="password"]:visible').count(), 0);
  const search = page.getByRole("textbox", { name: "Rechercher une caméra" });
  await search.fill("Caméra 002");
  await page.locator(".camera-row").click();
  await page
    .getByText("SIMULATION — identifiants refusés", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("FPS (images/s)", { exact: true }).count(),
    0,
  );
  await page.evaluate(() => (window.__sezaamTest.failSecond = false));
  await page
    .getByRole("button", {
      name: "Gérer la connexion aux caméras",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Réessayer les connexions", exact: true })
    .click();
  await page.locator(".operation").waitFor({ state: "hidden" });
  for (const name of ["Caméra 001", "Caméra 003", "Caméra 001"]) {
    await search.fill(name);
    await page.locator(".camera-row").click();
    await page.locator(".operation").waitFor({ state: "hidden" });
    assert.equal(
      await page.getByLabel("FPS (images/s)", { exact: true }).inputValue(),
      "25",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Se connecter", exact: true })
        .count(),
      0,
    );
  }
  assert.equal(
    await page.evaluate(
      () =>
        window.__sezaamTest.calls.filter((c) => c.method === "connectSession")
          .length,
    ),
    1,
  );
  await page.getByLabel("FPS (images/s)", { exact: true }).fill("20");
  await page
    .getByRole("button", {
      name: "Gérer la connexion aux caméras",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Connecter les caméras", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Modifications non enregistrées" })
    .waitFor();
  await page
    .getByRole("button", { name: "Continuer la modification", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Connexion à l’application" })
    .getByRole("button", { name: "Fermer la fenêtre" })
    .click();
  assert.equal(
    await page.getByLabel("FPS (images/s)", { exact: true }).inputValue(),
    "20",
  );
  await page
    .getByRole("main")
    .getByText("Modifications non enregistrées", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  assert.equal(
    await page.getByLabel("FPS (images/s)", { exact: true }).inputValue(),
    "25",
  );
  await page.getByLabel("FPS (images/s)", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Appliquer", exact: true }).click();
  await page.locator(".operation").waitFor({ state: "hidden" });
  const writes = await page.evaluate(() =>
    window.__sezaamTest.calls.filter((c) => c.method === "setVideo"),
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].input.fps, 20);
  assert.equal(writes[0].input.id, "00000000-0000-4000-8000-000000000001");
  await page.locator(".camera-content").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector(".apply-bar").getBoundingClientRect().top >=
        document.querySelector(".settings-grid").getBoundingClientRect().bottom,
    ),
    true,
    "En bas de page, la barre fixe laisse les derniers paramètres accessibles",
  );
  const bounds = (selector) =>
    page.locator(selector).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        bottom: r.bottom,
      };
    });
  const listBefore = await bounds(".camera-list");
  assert.ok(
    listBefore.bottom <= 1086 && listBefore.height > 700,
    "Liste fixée à la hauteur disponible",
  );
  const actionBounds = await bounds(".apply-bar");
  const osdBounds = await bounds(".osd-panel");
  assert.ok(
    Math.abs(actionBounds.x - osdBounds.x) < 2 &&
      Math.abs(actionBounds.width - osdBounds.width) < 2,
    "Actions alignées sur la largeur OSD",
  );
  const sidebarBefore = await bounds(".sidebar");
  assert.equal(
    sidebarBefore.bottom,
    1086,
    "La sidebar couvre la hauteur jusqu’au bas de la fenêtre",
  );
  await page.locator(".camera-content").evaluate((el) => {
    el.scrollTop = 0;
  });
  assert.deepEqual(
    await bounds(".camera-list"),
    listBefore,
    "La liste reste fixe quand les paramètres défilent",
  );
  assert.ok(
    (await bounds(".apply-bar")).y > 1086,
    "Les actions restent à la fin du formulaire, hors écran en haut",
  );
  assert.deepEqual(
    await bounds(".sidebar"),
    sidebarBefore,
    "Le défilement ne déplace pas la sidebar",
  );
  assert.equal(
    await page.getByText("Local · sans télémétrie", { exact: true }).count(),
    0,
  );
  await page
    .getByRole("button", { name: "Réduire la barre latérale", exact: true })
    .click();
  assert.equal((await bounds(".sidebar")).width, 68);
  assert.equal(
    await page
      .getByRole("button", { name: "Ouvrir la barre latérale", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  await page.screenshot({
    path: "test-results/sidebar-collapsed-SIMULATION.png",
  });
  await page
    .getByRole("button", { name: "Ouvrir la barre latérale", exact: true })
    .click();
  assert.deepEqual(await bounds(".sidebar"), sidebarBefore);
  const themeBounds = await bounds(".theme-toggle");
  for (const theme of ["dark", "light"]) {
    const current = await page.locator("html").getAttribute("data-theme");
    if (current !== theme)
      await page
        .getByRole("button", {
          name:
            theme === "dark"
              ? "Activer le thème sombre"
              : "Activer le thème clair",
        })
        .click();
    assert.deepEqual(
      await bounds(".theme-toggle"),
      themeBounds,
      "Le changement de thème ne déplace pas le bouton",
    );
    assert.equal((await page.locator(".theme-toggle").innerText()).trim(), "");
    await page.evaluate(await readFile(require.resolve("axe-core"), "utf8"));
    const axe = await page.evaluate(() =>
      window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
        },
      }),
    );
    assert.deepEqual(
      axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
    );
    await page.screenshot({
      path: `test-results/camera-config-${theme}-SIMULATION.png`,
      fullPage: true,
    });
    await page.locator(".camera-content").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.screenshot({
      path: `test-results/camera-config-${theme}-bottom-SIMULATION.png`,
    });
    assert.ok((await bounds(".apply-bar")).bottom <= 1086);
    await page.locator(".camera-content").evaluate((el) => {
      el.scrollTop = 0;
    });
  }
  await page
    .getByRole("button", { name: "Désactiver l’OSD", exact: true })
    .click();
  assert.equal(
    (
      await page.evaluate(() =>
        window.__sezaamTest.calls.filter((c) => c.method === "disableOSD"),
      )
    ).length,
    0,
  );
  await page.getByRole("button", { name: "Appliquer", exact: true }).click();
  await page.locator(".operation").waitFor({ state: "hidden" });
  await page.getByText("OSD désactivé", { exact: true }).waitFor();
  await page.getByLabel("Activer l’OSD sauvegardé", { exact: true }).check();
  await page.getByRole("button", { name: "Appliquer", exact: true }).click();
  await page.locator(".operation").waitFor({ state: "hidden" });
  await page
    .getByLabel("Texte personnalisé", { exact: true })
    .fill("Atelier modifié — TEST");
  await page.getByRole("button", { name: "Appliquer", exact: true }).click();
  await page.locator(".operation").waitFor({ state: "hidden" });
  assert.equal(
    await page.getByLabel("Texte personnalisé", { exact: true }).inputValue(),
    "Atelier modifié — TEST",
  );
  await page
    .getByRole("button", { name: "Ajouter une incrustation", exact: true })
    .click();
  await page
    .locator(".osd-create")
    .getByLabel("Contenu de l’incrustation")
    .selectOption("DateAndTime");
  await page
    .locator(".osd-create")
    .getByLabel("Format de date", { exact: false })
    .selectOption("yyyy-MM-dd");
  await page.getByRole("button", { name: "Appliquer", exact: true }).click();
  await page.locator(".operation").waitFor({ state: "hidden" });
  const createOSD = await page.evaluate(() =>
    window.__sezaamTest.calls.find((c) => c.method === "createOSD"),
  );
  assert.equal(createOSD.input.textType, "DateAndTime");
  assert.equal(createOSD.input.dateFormat, "yyyy-MM-dd");
  assert.equal(
    createOSD.input.text,
    undefined,
    "Le contenu texte masqué ne doit pas être envoyé pour la date",
  );
  await page.evaluate(() => window.__sezaamTest.webOSDFixture());
  for (const name of ["Caméra 003", "Caméra 001"]) {
    await search.fill(name);
    await page.locator(".camera-row").click();
    await page.locator(".operation").waitFor({ state: "hidden" });
  }
  await page.getByLabel("Activer l’OSD", { exact: true }).check();
  await page.getByLabel("Texte affiché", { exact: true }).fill("Entrée TEST");
  await page
    .getByLabel("Date et heure", { exact: true })
    .selectOption("topRight");
  assert.equal(
    await page.evaluate(
      () =>
        window.__sezaamTest.calls.filter((c) => c.method === "setWebOSD")
          .length,
    ),
    0,
  );
  await page.getByRole("button", { name: "Appliquer", exact: true }).click();
  await page.locator(".operation").waitFor({ state: "hidden" });
  assert.equal(
    await page.getByLabel("Activer l’OSD", { exact: true }).isChecked(),
    true,
  );
  assert.equal(
    await page.getByLabel("Texte affiché", { exact: true }).inputValue(),
    "Entrée TEST",
  );
  await page.getByLabel("Activer l’OSD", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Appliquer", exact: true }).click();
  await page.locator(".operation").waitFor({ state: "hidden" });
  assert.equal(
    await page.getByLabel("Activer l’OSD", { exact: true }).isChecked(),
    false,
  );
  assert.equal(
    await page.getByLabel("Texte affiché", { exact: true }).inputValue(),
    "Entrée TEST",
  );
  await page.getByRole("button", { name: "Lire", exact: true }).click();
  await page.getByRole("alert").waitFor();
  await page.getByRole("button", { name: "Lire", exact: true }).waitFor();
  const stopsBefore = await page.evaluate(
    () =>
      window.__sezaamTest.calls.filter((c) => c.method === "stopVideo").length,
  );
  await page.getByRole("button", { name: /Diagnostic Tests/ }).click();
  assert.ok(
    (await page.evaluate(
      () =>
        window.__sezaamTest.calls.filter((c) => c.method === "stopVideo")
          .length,
    )) > stopsBefore,
  );
  await page
    .getByRole("button", { name: "Lancer le diagnostic", exact: true })
    .click();
  await page.locator(".operation").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".diagnostic-check").count(), 4);
  await page.screenshot({
    path: "test-results/diagnostic-results-SIMULATION.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Caméras Configuration/ }).click();
  await page
    .getByRole("button", { name: "Ajouter par IP", exact: true })
    .click();
  await page.getByLabel("Adresse IPv4", { exact: true }).fill("999.1.1.1");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await page.getByRole("alert").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("alert").count(), 0);
  await page
    .getByRole("button", { name: "Ajouter par IP", exact: true })
    .click();
  assert.equal(await page.getByRole("alert").count(), 0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Paramètres de l’application", exact: true })
    .click();
  await page.getByLabel("Lecture automatique", { exact: false }).check();
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("quasar-preferences")).autoplay,
    ),
    true,
  );
  failVideo = false;
  await page.getByRole("button", { name: /Caméras Configuration/ }).click();
  await page.getByRole("button", { name: "Arrêter", exact: true }).waitFor();
  assert.equal(await page.locator("video").getAttribute("controls"), null);
  await page.getByRole("button", { name: "Arrêter", exact: true }).click();
  await page.locator(".camera-maintenance summary").click();
  await page
    .getByRole("button", { name: "Attribuer les IP", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Vérifier les adresses", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Attribuer les IP à 2 caméra(s)",
      exact: true,
    })
    .waitFor();
  assert.equal(await page.locator(".addressing-table tbody tr").count(), 3);
  assert.equal(
    await page.evaluate(
      () =>
        window.__sezaamTest.calls.filter((c) => c.method === "applyAddresses")
          .length,
    ),
    0,
  );
  await page.screenshot({ path: "test-results/addressing-SIMULATION.png" });
  await page.evaluate(() => {
    window.__sezaamTest.holdBatch = "applyAddresses";
  });
  await page
    .getByRole("button", {
      name: "Attribuer les IP à 2 caméra(s)",
      exact: true,
    })
    .click();
  await page.locator(".batch-progress").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Fermer la fenêtre", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(await page.getByRole("progressbar").getAttribute("value"), null);
  await page.evaluate(() => {
    window.__sezaamTest.emitBatch("address", {
      planId: "wrong-plan",
      completed: 99,
      total: 99,
      camera: "incorrecte",
      stage: "incorrecte",
    });
  });
  assert.equal(await page.getByText("incorrecte", { exact: false }).count(), 0);
  await page.evaluate(() => {
    window.__sezaamTest.emitBatch("address", {
      planId: "address-fixture",
      completed: 1,
      total: 2,
      camera: "192.0.2.12 → 192.168.1.12",
      stage: "Attribution et relecture de l’adresse",
    });
  });
  await page.waitForFunction(
    () => document.querySelector(".batch-progress progress")?.value === 1,
  );
  await page.locator("dialog[open] .dialog-content").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  assert.equal(
    await page.locator(".batch-progress").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight;
    }),
    true,
  );
  await page.screenshot({
    path: "test-results/addressing-progress-SIMULATION.png",
  });
  await page.evaluate(() => window.__sezaamTest.finishBatch());
  await page
    .getByText("SIMULATION — adresse vérifiée", { exact: true })
    .first()
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        window.__sezaamTest.calls.filter((c) => c.method === "applyAddresses")
          .length,
    ),
    1,
  );
  await page
    .getByText("Attribution des IP terminée — points à vérifier.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await page.locator(".batch-progress").count(), 0);
  await page.screenshot({
    path: "test-results/addressing-complete-SIMULATION.png",
  });
  await page
    .getByRole("button", { name: "Fermer la fenêtre", exact: true })
    .click();
  await search.fill("Caméra 004");
  await page.locator(".camera-row").click();
  await page.locator(".operation").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Arrêter", exact: true }).waitFor();
  const automaticCalls = await page.evaluate(() =>
    window.__sezaamTest.calls.filter(
      (c) => c.input?.id === "00000000-0000-4000-8000-000000000004",
    ),
  );
  assert.ok(
    automaticCalls.findIndex((c) => c.method === "startVideo") <
      automaticCalls.findIndex((c) => c.method === "selectCamera"),
    "Le flux démarre avant la lecture des réglages",
  );
  await page.getByRole("button", { name: "Arrêter", exact: true }).click();
  await page.getByRole("button", { name: "Lire", exact: true }).waitFor();
  await page.getByRole("button", { name: "Lire", exact: true }).click();
  await page.getByRole("button", { name: "Arrêter", exact: true }).waitFor();
  await page.getByRole("button", { name: "Arrêter", exact: true }).click();
  // A slow optional block must not hide working fields or erase edits when it arrives.
  await page.evaluate(() => {
    const id = "00000000-0000-4000-8000-000000000007";
    window.__sezaamTest.progressive = { [id]: true };
    window.__sezaamTest.emptyPreviewProfiles = { [id]: true };
    window.__sezaamTest.readDelay = { [id]: 1800 };
  });
  await search.fill("Caméra 007");
  await page.locator(".camera-row").click();
  await page
    .getByText("Lecture des paramètres complémentaires…", { exact: true })
    .waitFor();
  const progressiveGateway = page.getByLabel("Passerelle", { exact: true });
  await page.getByRole("button", { name: "Arrêter", exact: true }).waitFor();
  assert.equal(await progressiveGateway.isEnabled(), true);
  await progressiveGateway.fill("10.79.42.253");
  await page
    .getByText("Lecture en cours…", { exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    await progressiveGateway.inputValue(),
    "10.79.42.253",
    "La fin de lecture OSD conserve la modification réseau",
  );
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  assert.equal(await progressiveGateway.inputValue(), "10.79.42.254");
  await page.getByRole("button", { name: "Arrêter", exact: true }).click();
  // A slow camera must not lock the list or overwrite a newer selection.
  await page.evaluate(() => {
    window.__sezaamTest.readDelay = {
      "00000000-0000-4000-8000-000000000005": 1800,
    };
    window.__sezaamTest.readErrors = {
      "00000000-0000-4000-8000-000000000005": true,
    };
  });
  await search.fill("Caméra 005");
  await page.locator(".camera-row").click();
  await page.waitForFunction(() =>
    window.__sezaamTest.calls.some(
      (c) => c.method === "selectCamera" && c.input.id.endsWith("000005"),
    ),
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Paramètres de l’application", exact: true })
      .isEnabled(),
    true,
  );
  assert.equal(await page.locator(".camera-row").isEnabled(), true);
  await search.fill("Caméra 006");
  const switchedAt = Date.now();
  await page.locator(".camera-row").click();
  await page
    .getByRole("heading", { name: "TEST — Caméra 006", exact: true })
    .waitFor();
  assert.ok(
    Date.now() - switchedAt < 1000,
    "La sélection reste immédiate pendant une lecture lente",
  );
  await page.getByLabel("Adresse IP", { exact: true }).waitFor();
  await page.waitForTimeout(1900);
  assert.equal(
    await page.getByLabel("Adresse IP", { exact: true }).inputValue(),
    "10.79.42.16",
  );
  assert.equal(
    await page
      .getByText("SIMULATION — ancienne lecture échouée", { exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Paramètres par défaut", exact: true })
    .click();
  await page.locator("#default-syncTime").waitFor();
  await page.getByRole("button", { name: /Encodage vidéo/ }).click();
  await page.locator("#default-fps").fill("20");
  assert.equal(
    await page
      .getByRole("button", {
        name: "Appliquer à la caméra sélectionnée",
        exact: true,
      })
      .isEnabled(),
    false,
  );
  await page
    .getByRole("button", { name: "Enregistrer le profil", exact: true })
    .click();
  await page
    .getByText("Profil enregistré sur ce Mac. Aucune caméra modifiée.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        window.__sezaamTest.calls.filter((c) => c.method === "applyDefaults")
          .length,
    ),
    0,
  );
  for (const theme of ["dark", "light"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page
        .getByRole("button", {
          name:
            theme === "dark"
              ? "Activer le thème sombre"
              : "Activer le thème clair",
          exact: true,
        })
        .click();
    await page.screenshot({
      path: `test-results/defaults-${theme}.png`,
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false);
  }
  await page
    .getByRole("button", {
      name: "Appliquer à la caméra sélectionnée",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Appliquer les réglages compatibles",
      exact: true,
    })
    .waitFor();
  assert.equal(await page.locator(".review-camera-accordion").count(), 1);
  await page.evaluate(() => {
    window.__sezaamTest.holdBatch = "applyDefaults";
  });
  await page
    .getByRole("button", {
      name: "Appliquer les réglages compatibles",
      exact: true,
    })
    .click();
  await page
    .getByText("Application du profil en cours", { exact: true })
    .waitFor();
  assert.equal(await page.getByRole("progressbar").getAttribute("value"), null);
  await page.evaluate(() =>
    window.__sezaamTest.emitBatch("defaults", {
      completed: 0,
      total: 1,
      camera: "192.0.2.15",
      stage: "Encodage vidéo",
    }),
  );
  await page
    .getByText("Encodage vidéo · 192.0.2.15", { exact: true })
    .waitFor();
  await page.locator(".review-camera-accordion > summary").click();
  await page.locator("dialog[open] .dialog-content").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  assert.equal(
    await page.locator(".batch-progress").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight;
    }),
    true,
  );
  await page.screenshot({
    path: "test-results/profile-progress-SIMULATION.png",
  });
  await page.evaluate(() => window.__sezaamTest.finishBatch());
  await page
    .getByRole("heading", {
      name: "Bilan d’application du profil",
      exact: true,
    })
    .waitFor();
  await page
    .getByText("Application du profil terminée — points à vérifier.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await page.locator(".batch-progress").count(), 0);
  await page.screenshot({
    path: "test-results/profile-complete-SIMULATION.png",
  });
  assert.equal(await page.locator(".review-camera-accordion[open]").count(), 0);
  await page.locator(".review-camera-accordion > summary").click();
  await page.locator(".review-result-group.manual > summary").click();
  await page.locator(".review-result-group.ok > summary").click();
  await page.getByText("Non automatisé", { exact: true }).waitFor();
  assert.equal(await page.locator(".defaults-result-row.verified").count(), 1);
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page
    .getByRole("button", { name: "Compatibilité", exact: true })
    .click();
  assert.equal(
    await page.locator(".profile-support-table article").count(),
    52,
  );
  await page.getByLabel("Rechercher dans la compatibilité").fill("AWB Green");
  assert.equal(await page.locator(".profile-support-table article").count(), 1);
  await page.getByLabel("Rechercher dans la compatibilité").fill("");
  await page
    .getByRole("button", { name: "Vérifier cette caméra", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ouvrir le rapport", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        window.__sezaamTest.calls.filter((c) => c.method === "applyDefaults")
          .length,
    ),
    1,
  );
  for (const theme of ["light", "dark"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page
        .getByRole("button", {
          name:
            theme === "dark"
              ? "Activer le thème sombre"
              : "Activer le thème clair",
          exact: true,
        })
        .click();
    await page.screenshot({
      path: `test-results/profile-compatibility-${theme}.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await page
    .getByRole("button", { name: "Journal et erreurs", exact: true })
    .click();
  await page.locator(".profile-history button").first().waitFor();
  assert.equal(await page.locator(".profile-history button").count(), 2);
  await page.locator(".profile-history button").first().click();
  await page
    .getByRole("heading", { name: "Journal du profil", exact: true })
    .waitFor();
  await page
    .getByLabel("Filtrer le journal par résultat")
    .selectOption("unread");
  assert.equal(
    await page.locator(".profile-run-details .defaults-result-row").count(),
    1,
  );
  await page
    .getByText("Non vérifié · lecture / contrôle impossible", { exact: true })
    .waitFor();
  await page
    .getByLabel("Filtrer le journal par résultat")
    .selectOption("failed");
  await page
    .getByText("Aucun champ pour ce filtre.", { exact: true })
    .waitFor();
  await page.getByLabel("Filtrer le journal par résultat").selectOption("all");
  await page.getByLabel("Rechercher dans le journal").fill("Cadence");
  assert.equal(
    await page.locator(".profile-run-details .defaults-result-row").count(),
    1,
  );
  await page.screenshot({
    path: "test-results/profile-journal.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Exporter le rapport JSON", exact: true })
    .click();
  await page
    .getByText("SIMULATION — rapport JSON exporté", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await page.getByRole("button", { name: /Appliquer à toutes/ }).click();
  await page
    .getByRole("button", {
      name: "Appliquer les réglages compatibles",
      exact: true,
    })
    .waitFor();
  assert.equal(await page.locator(".review-camera-accordion").count(), 180);
  assert.equal(await page.locator(".review-camera-accordion[open]").count(), 0);
  assert.equal(await page.locator(".review-summary").count(), 0);
  const ips = await page.locator(".review-camera-title code").allTextContents();
  assert.deepEqual(
    ips,
    [...ips].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  );
  await page.screenshot({ path: "test-results/defaults-review-collapsed.png" });
  const cameraReview = page.locator(".review-camera-accordion").nth(1);
  await cameraReview.locator(":scope > summary").click();
  await cameraReview.locator(".review-result-group").first().waitFor();
  assert.equal(
    await cameraReview.locator(".review-result-group[open]").count(),
    0,
  );
  const groups = await cameraReview
    .locator(".review-result-group")
    .evaluateAll((nodes) => nodes.map((n) => n.className));
  assert.deepEqual(groups, [
    "review-result-group errors",
    "review-result-group manual",
    "review-result-group unsupported",
    "review-result-group ready",
    "review-result-group ok",
  ]);
  await cameraReview.locator(".review-result-group.manual > summary").click();
  await cameraReview.getByText("Non automatisé", { exact: true }).waitFor();
  await cameraReview
    .locator(".review-result-group.unsupported > summary")
    .click();
  await cameraReview
    .getByText("SIMULATION — résolution non proposée par la caméra", {
      exact: true,
    })
    .waitFor();
  assert.match(
    await cameraReview.locator(".review-camera-title").textContent(),
    /5 réglages au total/,
  );
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    await page.screenshot({
      path: `test-results/defaults-review-${theme}.png`,
    });
  }
  await page.setViewportSize({ width: 700, height: 820 });
  assert.equal(
    await page.evaluate(() => {
      const content = document.querySelector("dialog[open] .dialog-content");
      return content.scrollWidth > content.clientWidth;
    }),
    false,
  );
  await page.screenshot({ path: "test-results/defaults-review-narrow.png" });
  await page.setViewportSize({ width: 1448, height: 1086 });
  await cameraReview.locator(":scope > summary").click();
  await cameraReview.locator(":scope > summary").click();
  await cameraReview.locator(".review-result-group").first().waitFor();
  assert.equal(
    await cameraReview.locator(".review-result-group[open]").count(),
    0,
  );
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () =>
        window.__sezaamTest.calls.filter((c) => c.method === "applyDefaults")
          .length,
    ),
    1,
  );
  await page
    .getByRole("button", {
      name: "Caméras Configuration et paramètres",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Paramètres par défaut", exact: true })
    .click();
  await page.getByRole("button", { name: /Encodage vidéo/ }).click();
  assert.equal(await page.locator("#default-fps").inputValue(), "20");
  await page
    .getByRole("button", {
      name: "Caméras Configuration et paramètres",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Arrêter", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Gérer la connexion aux caméras",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Déconnecter", exact: true }).click();
  await page.locator(".operation").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Se connecter", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("FPS (images/s)", { exact: true }).count(),
    0,
  );
  if (!(await page.locator(".camera-maintenance").getAttribute("open"))) {
    const isOpen = await page
      .locator(".camera-maintenance")
      .evaluate((el) => el.open);
    if (!isOpen) await page.locator(".camera-maintenance summary").click();
  }
  await page
    .getByRole("button", { name: "Réinitialiser les caméras…", exact: true })
    .click();
  const resetDialog = page.getByRole("dialog", {
    name: "Remise à zéro d’usine",
  });
  await resetDialog.getByRole("button", { name: /Vérifier les/ }).click();
  await resetDialog
    .getByText("SIMULATION — conflit IP", { exact: true })
    .waitFor();
  const resetButton = resetDialog.getByRole("button", {
    name: "Réinitialiser 2 caméra(s)",
    exact: true,
  });
  assert.equal(await resetButton.isDisabled(), true);
  await resetDialog
    .getByLabel("Saisissez EFFACER pour autoriser le reset")
    .fill("oui");
  assert.equal(await resetButton.isDisabled(), true);
  await resetDialog
    .getByLabel("Saisissez EFFACER pour autoriser le reset")
    .fill("EFFACER");
  assert.equal(await resetButton.isEnabled(), true);
  await page.screenshot({ path: "test-results/factory-reset-review.png" });
  await resetButton.click();
  await resetDialog
    .getByRole("button", { name: "Redétecter les caméras" })
    .waitFor();
  assert.equal(
    await resetDialog.getByRole("cell", { name: /Commande acceptée/ }).count(),
    2,
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.__sezaamTest.calls.filter(
          (c) => c.method === "applyFactoryReset",
        ).length,
    ),
    1,
  );
  assert.equal(
    await resetDialog.getByRole("button", { name: /Réinitialiser 2/ }).count(),
    0,
  );
  await resetDialog.getByRole("button", { name: "Fermer la fenêtre" }).click();
  assert.deepEqual(errors, []);
  await checkSettingsHydration(
    page,
    await page.evaluate(() => window.__sezaamTest.detailFixture()),
  );
  await writeFile(
    "test-results/ui-fixtures.json",
    JSON.stringify(
      {
        simulation: true,
        checks: [
          "180 caméras et recherche",
          "Session commune, refus partiel et nouvelle tentative",
          "Aller-retour entre caméras sans nouvelle saisie",
          "Déconnexion globale et nettoyage des erreurs de fenêtre",
          "Annuler et appliquer un formulaire",
          "Une seule caméra ciblée",
          "OSD différé jusqu’à Appliquer",
          "Erreur flux et arrêt du relais",
          "Navigation et diagnostic avec quatre statuts",
          "Axe clair/sombre sur formulaires actifs",
          "Erreur IP affichée",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Parcours UI simulés : réussis. Aucun matériel contacté.");
} catch (error) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({ path: "test-results/ui-failure.png" });
    console.log(
      await page
        .locator(".osd-create")
        .innerText()
        .catch(() => "No OSD editor"),
    );
  }
  throw error;
} finally {
  await browser.close();
  wss.close();
  await new Promise((r) => server.close(r));
}
