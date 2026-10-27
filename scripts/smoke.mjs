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
    await page.getByRole("button", { name: /Caméras Configuration/ }).click();
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
    await page.getByRole("button", { name: /Diagnostic Tests/ }).click();
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
