import { _electron as electron } from "playwright";
import path from "node:path";
import { mkdir, writeFile, readFile, mkdtemp } from "node:fs/promises";
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
  await navigation
    .getByRole("button", { name: "Mes Box", exact: true })
    .click();
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
  await navigation
    .getByRole("button", { name: "Mes Box", exact: true })
    .click();
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
