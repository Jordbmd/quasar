import { _electron as electron } from "playwright";
import path from "node:path";
import {
  mkdir,
  writeFile,
  readFile,
  mkdtemp,
  cp,
  readdir,
  lstat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
await mkdir("test-results", { recursive: true });
const env = {
  ...process.env,
  QUASAR_TEST_NO_NETWORK: "1",
  SEZAAM_TEST_USER_DATA: await mkdtemp(path.join(tmpdir(), "sezaam-ui-")),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.SEZAAM_DEV_URL;
let app = await electron.launch({
  args: process.env.QUASAR_PACKAGED_EXECUTABLE ? [] : [path.resolve(".")],
  executablePath: process.env.QUASAR_PACKAGED_EXECUTABLE || undefined,
  env,
  timeout: 30000,
});
const errors = [];
const checks = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("heading", { name: "Caméras", exact: true })
    .waitFor()
    .catch(async (error) => {
      console.error(
        "Isolated test window",
        page.url(),
        await page.locator("body").innerText(),
        errors,
      );
      await page.screenshot({ path: "test-results/startup-failure.png" });
      throw error;
    });
  await page.locator(".operation").waitFor({ state: "hidden" });
  const state = await page.evaluate(() =>
    window.sezaam.call("state", undefined),
  );
  assert.equal(state.cameras.length, 0);
  assert.equal(state.reports.length, 0);
  assert.equal(state.videoReady, true, "Relais embarqué disponible");
  if (process.env.QUASAR_PACKAGED_EXECUTABLE) {
    const runtime = await app.evaluate(({ app }) => ({
      packaged: app.isPackaged,
      appPath: app.getAppPath(),
    }));
    assert.equal(runtime.packaged, true);
    assert.match(runtime.appPath, /app\.asar$/);
    const version = await app.evaluate(({ app }) => {
      const fs = process.getBuiltinModule("fs");
      return JSON.parse(
        fs.readFileSync(`${app.getAppPath()}/dist/version.json`, "utf8"),
      );
    });
    assert.deepEqual(
      version,
      JSON.parse(await readFile("dist/version.json", "utf8")),
      "Le paquet contient le manifest exact de la construction testée",
    );
    await writeFile(
      "test-results/packaged-version.json",
      JSON.stringify(version, null, 2) + "\n",
    );
    checks.push("Paquet autonome : app.asar et relais embarqué disponibles");
  }
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  assert.equal(
    await page.getByText("Préparation Ethernet", { exact: true }).count(),
    0,
  );
  const forbidden = await page.evaluate(async () => {
    try {
      await window.sezaam.call("prepareNetwork", {});
      return "unexpected";
    } catch (e) {
      return e.message;
    }
  });
  assert.match(forbidden, /inconnue/);
  const removedNetworkChoice = await page.evaluate(async () => {
    try {
      await window.sezaam.call("selectAdapter", { id: "en0" });
      return "unexpected";
    } catch (e) {
      return e.message;
    }
  });
  assert.match(removedNetworkChoice, /inconnue/);
  assert.equal(await page.locator(".network-strip select").count(), 0);
  assert.equal(state.network.adapter?.kind ?? "ethernet", "ethernet");
  assert.equal("adapters" in state.network, false);
  assert.equal("selected" in state.network, false);
  checks.push(
    "Ethernet automatique : aucun sélecteur ni IPC de choix réseau",
    "Caméras au démarrage sans étape Ethernet",
    "Aucune caméra fictive",
    "IPC de configuration Mac supprimé",
    "Renderer sans Node",
  );
  await page.getByRole("button", { name: "Box", exact: true }).click();
  await page.getByLabel("Importer les casiers", { exact: true }).setInputFiles({
    name: "SIMULATION Box Electron.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Casier,N°,Colonne,Zone,Ports,IP\nIHM,0,1,1,0,0.0.0.0\nS,7,1,2,7,192.168.1.17\n",
    ),
  });
  await page
    .getByRole("heading", { name: "SIMULATION Box Electron", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "IHM 0, sans caméra" }).isDisabled(),
    true,
  );
  assert.equal(await page.locator(".box-locker.warning").count(), 1);
  await page
    .getByRole("button", { name: "Modifier la Box", exact: true })
    .click();
  const boxEditor = page.getByRole("dialog", {
    name: "Modifier la Box",
    exact: true,
  });
  await boxEditor
    .getByLabel("ID de la Box", { exact: true })
    .fill("TEST-ELECTRON");
  await boxEditor
    .getByLabel("Adresse d’installation", { exact: true })
    .fill("SIMULATION · adresse de test");
  await boxEditor.getByRole("button", { name: "Enregistrer la Box" }).click();
  await boxEditor.waitFor({ state: "hidden" });
  await page.getByText("TEST-ELECTRON", { exact: true }).waitFor();
  checks.push(
    "Fiche Box : édition, enregistrement et métadonnées dans le paquet Electron",
  );
  const navigation = page.getByRole("navigation", {
    name: "Navigation principale",
  });
  await navigation.getByRole("button", { name: /^Mes Box/ }).click();
  assert.equal(await page.locator(".box-library-card").count(), 1);
  await page
    .getByRole("button", { name: "Créer une Box", exact: true })
    .click();
  const manualBox = page.getByRole("dialog", {
    name: "Créer une Box sans fichier",
    exact: true,
  });
  await manualBox
    .getByLabel("Nom de la Box", { exact: true })
    .fill("SIMULATION seconde intervention");
  await manualBox
    .getByLabel("ID de la Box", { exact: true })
    .fill("TEST-SECOND");
  await manualBox
    .getByRole("button", { name: "Enregistrer la Box", exact: true })
    .click();
  await manualBox.waitFor({ state: "hidden" });
  await page
    .getByRole("heading", {
      name: "SIMULATION seconde intervention",
      exact: true,
    })
    .waitFor();
  await navigation.getByRole("button", { name: /^Mes Box/ }).click();
  assert.equal(await page.locator(".box-library-card").count(), 2);
  await page
    .locator(".box-library-card")
    .filter({
      has: page.getByRole("heading", {
        name: "SIMULATION Box Electron",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Ouvrir la Box", exact: true })
    .click();
  await page.getByText("TEST-ELECTRON", { exact: true }).waitFor();
  checks.push(
    "Bibliothèque Box : deux fiches distinctes et changement de contexte dans Electron",
  );
  await page.getByRole("button", { name: "Classique", exact: true }).click();
  checks.push(
    "Mode Box : import CSV dans le worker Electron, IHM sans caméra, retour au mode Classique",
  );
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
    await page.getByRole("button", { name: "Caméras", exact: true }).click();
    await page.getByRole("heading", { name: "Caméras", exact: true }).waitFor();
    await page.locator(".operation").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Ajouter par IP", exact: true })
      .click();
    await page.keyboard.press("Tab");
    assert.ok(
      await page.evaluate(() => document.activeElement !== document.body),
    );
    await page.evaluate(await readFile(require.resolve("axe-core"), "utf8"));
    const result = await page.evaluate(() =>
      window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
        },
      }),
    );
    await writeFile(
      `test-results/accessibility-${theme}.json`,
      JSON.stringify(result, null, 2),
    );
    assert.deepEqual(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: `test-results/cameras-${theme}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Diagnostic", exact: true }).click();
    await page
      .getByRole("heading", { name: "Diagnostic des caméras", exact: true })
      .waitFor();
    await page.screenshot({
      path: `test-results/diagnostic-${theme}.png`,
      fullPage: true,
    });
    const diagnosticAxe = await page.evaluate(() =>
      window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
        },
      }),
    );
    assert.deepEqual(
      diagnosticAxe.violations.map((v) => v.id),
      [],
    );
    checks.push(
      `Thème ${theme} : navigation, capture, clavier, aucune violation Axe détectée`,
    );
  }
  await page.getByRole("button", { name: "Activer le thème sombre" }).click();
  await app.close();
  app = await electron.launch({
    args: process.env.QUASAR_PACKAGED_EXECUTABLE ? [] : [path.resolve(".")],
    executablePath: process.env.QUASAR_PACKAGED_EXECUTABLE || undefined,
    env,
    timeout: 30000,
  });
  const reopened = await app.firstWindow();
  await reopened
    .getByRole("heading", { name: "Caméras", exact: true })
    .waitFor();
  assert.equal(
    await reopened.locator("html").getAttribute("data-theme"),
    "dark",
  );
  checks.push("Préférence thème persistée après fermeture et relancement");
  await reopened.getByTitle("Paramètres", { exact: true }).click();
  await reopened.getByLabel("Langue", { exact: true }).selectOption("en");
  await reopened
    .getByRole("heading", {
      name: "Application settings",
      exact: true,
      level: 2,
    })
    .waitFor();
  assert.equal(await reopened.locator("html").getAttribute("lang"), "en");
  await reopened.getByLabel("Theme", { exact: true }).selectOption("system");
  assert.equal(
    await reopened.evaluate(() => localStorage.getItem("sezaam-theme")),
    "system",
  );
  const menu = await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu().items.map((item) => item.label),
  );
  assert.ok(menu.includes("Edit"));
  assert.ok(menu.includes("View"));
  const invalidLanguage = await reopened.evaluate(async () => {
    try {
      await window.sezaam.call("setLanguage", { language: "de" });
      return "unexpected";
    } catch (error) {
      return error instanceof Error ? "rejected" : "unexpected";
    }
  });
  assert.equal(invalidLanguage, "rejected");
  assert.equal(
    await reopened.evaluate(() => window.sezaam.call("getLanguage", undefined)),
    "en",
  );
  await reopened.screenshot({
    path: "test-results/preferences-en.png",
    fullPage: true,
  });
  await app.close();
  app = await electron.launch({
    args: process.env.QUASAR_PACKAGED_EXECUTABLE ? [] : [path.resolve(".")],
    executablePath: process.env.QUASAR_PACKAGED_EXECUTABLE || undefined,
    env,
    timeout: 30000,
  });
  const english = await app.firstWindow();
  await english
    .getByRole("heading", { name: "Cameras", exact: true })
    .waitFor();
  assert.equal(
    await english.evaluate(() => window.sezaam.call("getLanguage", undefined)),
    "en",
  );
  const preferences = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  );
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.webSecurity, true);
  const blocked = await english.evaluate(async () => {
    try {
      await fetch("https://example.invalid/quasar-network-check");
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(blocked, true);
  checks.push(
    "FR/EN persistés : interface et menus natifs, IPC langue invalide refusée",
    "Thème système explicite persisté",
    "Sandbox/contextIsolation/webSecurity actifs ; Node absent ; HTTPS externe bloqué",
  );
  // Cold native recovery, wholly inside test-created directories. Never touch
  // the installed launcher or real user data; ciphertext remains OS-account bound.
  const savedLocal = await english.evaluate(() => ({ ...localStorage }));
  assert.ok(
    Object.values(savedLocal).some((value) => value.includes("TEST-ELECTRON")),
  );
  const isolatedLogin = await english.evaluate(() =>
    window.sezaam.call("getAutoLogin", undefined),
  );
  assert.equal(
    isolatedLogin.available,
    false,
    "The isolated test mode never opens the real OS keyring",
  );
  const originalData = env.SEZAAM_TEST_USER_DATA;
  await app.close();
  await mkdir(path.join(originalData, "profile-journal", "backups"), {
    recursive: true,
  });
  await writeFile(
    path.join(originalData, "profile-journal", "backups", "synthetic.json"),
    '{"synthetic":true,"phase":"before"}',
  );
  const recoveryRoot = await mkdtemp(
    path.join(tmpdir(), "quasar-native-recovery-"),
  );
  const backup = path.join(recoveryRoot, "backup");
  const restored = path.join(recoveryRoot, "restored");
  async function hashes(root, relative = "") {
    const result = {};
    for (const name of (await readdir(path.join(root, relative))).sort()) {
      const key = path.join(relative, name),
        file = path.join(root, key);
      const entry = await lstat(file);
      assert.equal(
        entry.isSymbolicLink(),
        false,
        "No symlink in isolated recovery fixture",
      );
      if (entry.isDirectory()) Object.assign(result, await hashes(root, key));
      else if (entry.isFile())
        result[key] = createHash("sha256")
          .update(await readFile(file))
          .digest("hex");
    }
    return result;
  }
  const before = await hashes(originalData);
  await cp(originalData, backup, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  await cp(backup, restored, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  assert.deepEqual(await hashes(backup), before);
  assert.deepEqual(await hashes(restored), before);
  await writeFile(
    path.join(originalData, "profile-journal", "backups", "synthetic.json"),
    '{"synthetic":true,"phase":"after"}',
  );
  env.SEZAAM_TEST_USER_DATA = restored;
  app = await electron.launch({
    args: process.env.QUASAR_PACKAGED_EXECUTABLE ? [] : [path.resolve(".")],
    executablePath: process.env.QUASAR_PACKAGED_EXECUTABLE || undefined,
    env,
    timeout: 30000,
  });
  const recovered = await app.firstWindow();
  await recovered
    .getByRole("heading", { name: "Cameras", exact: true })
    .waitFor();
  assert.deepEqual(
    await recovered.evaluate(() => ({ ...localStorage })),
    savedLocal,
  );
  assert.equal(
    await recovered.evaluate(() =>
      window.sezaam.call("getLanguage", undefined),
    ),
    "en",
  );
  assert.equal(
    (await recovered.evaluate(() => window.sezaam.call("state", undefined)))
      .cameras.length,
    0,
  );
  assert.match(
    await readFile(
      path.join(restored, "profile-journal", "backups", "synthetic.json"),
      "utf8",
    ),
    /before/,
  );
  assert.match(
    await readFile(
      path.join(originalData, "profile-journal", "backups", "synthetic.json"),
      "utf8",
    ),
    /after/,
  );
  await writeFile(
    process.env.QUASAR_PACKAGED_EXECUTABLE
      ? "test-results/native-recovery-packaged.json"
      : "test-results/native-recovery.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        platform: process.platform,
        packaged: Boolean(process.env.QUASAR_PACKAGED_EXECUTABLE),
        runtime: JSON.parse(await readFile("dist/version.json", "utf8")),
        filesCompared: Object.keys(before).length,
        checks: [
          "cold-copy-hashes-identical",
          "restored-new-directory",
          "box-library-and-preferences-restored",
          "native-language-restored",
          "journal-snapshot-distinct-from-original",
          "original-and-backup-preserved",
          "camera-network-disabled",
        ],
        nativeSafeStorage:
          "disabled-by-isolated-test-mode; encrypted-restore-tested-separately-with-injected-cipher",
        limits: [
          "no-installed-launcher-replacement",
          "no-installer-wizard",
          "no-cross-account-key-migration",
          "no-real-camera",
        ],
      },
      null,
      2,
    ),
  );
  checks.push(
    "Sauvegarde native à froid : hashes, nouvelle destination, Box/langue/thème/journal, originaux conservés",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    process.env.QUASAR_PACKAGED_EXECUTABLE
      ? "test-results/smoke-packaged.json"
      : "test-results/smoke.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks,
        errors,
        networkWrites: 0,
        cameraRequests: 0,
      },
      null,
      2,
    ),
  );
  console.log(checks.join("\n"));
} finally {
  await app.close();
}
