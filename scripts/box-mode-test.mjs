import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import XLSX from "xlsx";
const require = createRequire(import.meta.url);
const root = path.resolve("dist/renderer");
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const file = path.resolve(
      root,
      "." + (url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (!file.startsWith(root + path.sep)) throw Error();
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".svg")
            ? "image/svg+xml"
            : file.endsWith(".woff2")
              ? "font/woff2"
              : "text/html",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  headless: true,
});
await mkdir("test-results", { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1448, height: 1086 },
  });
  await context.addInitScript(() => {
    localStorage.setItem(
      "quasar-preferences",
      JSON.stringify({ autoplay: false }),
    );
    localStorage.setItem("sezaam-theme", "light");
    const cameras = [1, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(
      (n) => ({
        id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        ip: `192.168.1.${n + 10}`,
        port: 80,
        path: "/onvif/device_service",
        mac: `02:00:00:00:00:${String(n).padStart(2, "0")}`,
        endpoint: `urn:uuid:fixture-${n}`,
        name: `SIMULATION caméra ${n}`,
        status: "Connectée",
        ambiguous: false,
        ...(n === 8
          ? { connectionError: "SIMULATION · lecture impossible" }
          : {}),
      }),
    );
    let plan;
    window.__boxTest = { calls: [], cameras };
    window.__activeBox = () => {
      const library = JSON.parse(localStorage.getItem("quasar-box-library"));
      return library.entries.find((e) => e.id === library.activeId);
    };
    const state = () => ({
      platform: "darwin",
      arch: "arm64",
      network: {
        ready: true,
        reason: "SIMULATION",
        overlaps: [],
        adapter: {
          id: "sim",
          service: "Ethernet simulé",
          address: "192.168.1.2",
          mask: "255.255.255.0",
          link: true,
        },
      },
      cameras,
      logs: [],
      reports: [],
      videoReady: false,
      session: {
        active: true,
        username: "SIMULATION",
        connected: cameras.length,
        total: cameras.length,
        failures: [],
      },
    });
    window.sezaam = {
      onNetworkChanged: () => () => {},
      onInvalidated: () => () => {},
      onCameraDetail: () => () => {},
      onPreviewLighting: () => () => {},
      onDefaultsProgress: () => () => {},
      onAddressProgress: () => () => {},
      onFactoryResetProgress: () => () => {},
      call: async (method, input) => {
        window.__boxTest.calls.push({ method, input });
        if (method === "state") return structuredClone(state());
        if (method === "discover") return structuredClone(cameras);
        if (method === "previewAddresses") {
          plan = {
            id: "fixture-plan",
            createdAt: new Date().toISOString(),
            rows: input.assignments.map((a) => ({
              id: a.id,
              name: "SIMULATION",
              identity: a.id,
              from: cameras.find((c) => c.id === a.id).ip,
              to: `192.168.1.${a.locker + 10}`,
              locker: a.locker,
              state: "ready",
              message: "SIMULATION — prête",
            })),
          };
          return structuredClone(plan);
        }
        if (method === "applyAddresses")
          return {
            ...plan,
            rows: plan.rows.map((r) => ({
              ...r,
              state: r.locker === 8 ? "failed" : "verified",
              message:
                r.locker === 8
                  ? "SIMULATION · vérification impossible"
                  : "SIMULATION · IP vérifiée",
            })),
          };
        if (method === "previewProfiles") return [];
        if (method === "selectCamera" || method === "readCamera") {
          const c = cameras.find((c) => c.id === input.id);
          const f = { state: "unsupported", message: "SIMULATION" };
          return {
            camera: c,
            profiles: [],
            network: f,
            gateway: f,
            dns: f,
            video: f,
            image: f,
            osd: f,
            capabilities: f,
            lighting: f,
          };
        }
        if (method === "stopVideo" || method === "cancelCameraRead") return;
        throw Error("Appel inattendu : " + method);
      },
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("button", { name: "Classique", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Classique", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Box", exact: true }).click();
  const rows = [
    ["Casier", "N°", "Colonne", "Zone", "Ports", "IP"],
    ["IHM", 0, 1, 1, 0, "0.0.0.0"],
    ["M", 1, 1, 2, 1, "192.168.1.11"],
    ["L", 7, 1, 3, 7, "192.168.1.17"],
    ["S", 8, 2, 1, 8, "192.168.1.18"],
    ["S", 9, 2, 2, 9, "192.168.1.19"],
    ["M", 10, 2, 3, 10, "192.168.1.20"],
    ["L", 11, 2, 4, 11, "192.168.1.21"],
    ["M", 12, 2, 5, 12, "192.168.1.22"],
    ["M", 13, 3, 1, 13, "192.168.1.23"],
    ["L", 14, 3, 2, 14, "192.168.1.24"],
    ["L", 15, 3, 3, 15, "192.168.1.25"],
    ["M", 16, 4, 1, 16, "192.168.1.26"],
    ["P", 17, 4, 2, 17, "192.168.1.27"],
    ["P", 18, 4, 2, 18, "192.168.1.28"],
  ];
  for (const row of rows.slice(1))
    row[4] = row[1] ? `1:${row[1]}` : "2:14,3:14";
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet(rows),
    "Back office",
  );
  await page.getByLabel("Importer les casiers", { exact: true }).setInputFiles({
    name: "SIMULATION — Box Atelier.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
  });
  await page
    .getByRole("heading", { name: "SIMULATION — Box Atelier" })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "IHM 0, sans caméra" }).isDisabled(),
    true,
  );
  assert.equal(await page.locator(".box-locker.success").count(), 12);
  assert.equal(await page.locator(".box-locker.danger").count(), 1);
  await page.getByRole("button", { name: /Casier 7 ·/ }).click();
  await page.getByRole("heading", { name: "Casier 7", exact: true }).waitFor();
  await page.screenshot({ path: "test-results/box-mode-light-SIMULATION.png" });
  await page.evaluate(
    await readFile(require.resolve("axe-core/axe.min.js"), "utf8"),
  );
  const checkAxe = async () => {
    const r = await page.evaluate(() =>
      window.axe.run(".box-page", {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
      }),
    );
    assert.deepEqual(
      r.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
    );
  };
  await checkAxe();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await checkAxe();
  await page.screenshot({ path: "test-results/box-mode-dark-SIMULATION.png" });
  // The camera was opened by selecting casier 7, without a second action.
  await page
    .getByRole("heading", { name: "SIMULATION caméra 7", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        window.__boxTest.calls.find((c) => c.method === "selectCamera").input
          .id,
    ),
    "00000000-0000-4000-8000-000000000007",
  );
  await page.getByLabel("Importer les casiers", { exact: true }).setInputFiles({
    name: "invalide.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Casier,N°,Colonne,Zone,Ports,IP\nS,1,1,1,1,192.168.1.11",
    ),
  });
  await page.getByText(/Une seule IHM est requise/).waitFor();
  await page
    .getByRole("heading", { name: "SIMULATION — Box Atelier" })
    .waitFor();
  await page
    .getByLabel("Caméra de ce casier")
    .selectOption("00000000-0000-4000-8000-000000000001");
  await page
    .getByRole("button", { name: "Attribuer les IP · toute la Box" })
    .click();
  await page
    .getByText(
      "Une même caméra est associée à plusieurs casiers. Corrigez les associations.",
    )
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        window.__boxTest.calls.filter((c) => c.method === "previewAddresses")
          .length,
    ),
    0,
  );
  await page
    .getByLabel("Caméra de ce casier")
    .selectOption("00000000-0000-4000-8000-000000000007");
  await page
    .getByRole("button", { name: "Attribuer les IP · toute la Box" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Vérifier les adresses" }).click();
  await dialog
    .getByRole("button", { name: "Attribuer les IP à 13 caméra(s)" })
    .waitFor();
  const assignments = await page.evaluate(
    () =>
      window.__boxTest.calls.find((c) => c.method === "previewAddresses").input
        .assignments,
  );
  assert.deepEqual(
    assignments.map((a) => a.locker),
    [1, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  );
  assert.equal(await dialog.getByLabel("Premier casier").count(), 0);
  await dialog
    .getByRole("button", { name: "Attribuer les IP à 13 caméra(s)" })
    .click();
  await dialog
    .getByRole("button", { name: "Fermer le bilan", exact: true })
    .click();
  await page.getByRole("button", { name: /Casier 8 ·/ }).click();
  assert.equal(await page.locator(".box-locker.danger").count(), 1);
  await page.reload();
  assert.equal(
    await page
      .getByRole("button", { name: "Classique", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Box", exact: true }).click();
  await page
    .getByRole("heading", { name: "SIMULATION — Box Atelier" })
    .waitFor();
  await page.setViewportSize({ width: 900, height: 900 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "test-results/box-mode-compact-SIMULATION.png",
  });

  // Edit the installed Box, then reimport the same identity with revised data.
  await page.setViewportSize({ width: 1448, height: 1086 });
  await page
    .getByRole("button", { name: "Modifier la Box", exact: true })
    .click();
  let editor = page.getByRole("dialog", {
    name: "Modifier la Box",
    exact: true,
  });
  await editor
    .getByLabel("Nom de la Box", { exact: true })
    .fill("SIMULATION · Atelier personnalisé");
  await editor.getByLabel("ID de la Box", { exact: true }).fill("140");
  await editor
    .getByLabel("Adresse d’installation", { exact: true })
    .fill("Adresse de test");
  await editor.getByLabel("Encastrée", { exact: true }).selectOption("true");
  await editor.getByRole("button", { name: /Casiers et serrures/ }).click();
  await editor.getByLabel("Numéro ligne 3", { exact: true }).fill("1");
  await editor.getByRole("button", { name: "Enregistrer la Box" }).click();
  await editor
    .getByText("Numéro de casier en double.", { exact: true })
    .waitFor();
  await editor.getByLabel("Numéro ligne 3", { exact: true }).fill("7");
  await editor.getByLabel("Ports Southco ligne 2", { exact: true }).fill("3:1");
  await page.screenshot({ path: "test-results/box-editor-SIMULATION.png" });
  await page.evaluate(
    await readFile(require.resolve("axe-core/axe.min.js"), "utf8"),
  );
  const editorAxe = await page.evaluate(() =>
    window.axe.run("dialog[open]", {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    }),
  );
  assert.deepEqual(
    editorAxe.violations.map((v) => v.id),
    [],
  );
  await editor.getByRole("button", { name: "Enregistrer la Box" }).click();
  await editor.waitFor({ state: "hidden" });
  await page
    .getByRole("heading", { name: "SIMULATION · Atelier personnalisé" })
    .waitFor();
  const oldBindings = await page.evaluate(() => window.__activeBox().bindings);
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["ID Box", 140],
      ["Adresse finale destination", "Adresse corrigée"],
      ["Encastrée", "Non"],
      ["Fermeture arrière", "Oui"],
    ]),
    "Infos Box",
  );
  book.Sheets["Back office"].E3 = { t: "s", v: "3:2" };
  const upload = async (name) =>
    page.getByLabel("Importer les casiers", { exact: true }).setInputFiles({
      name,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
    });
  await upload("Production corrigée.xlsx");
  await page.getByText("Adresse corrigée", { exact: true }).waitFor();
  const afterImport = await page.evaluate(() => window.__activeBox());
  assert.equal(afterImport.box.name, "SIMULATION · Atelier personnalisé");
  assert.equal(afterImport.box.metadata.embedded, false);
  assert.equal(
    afterImport.box.lockers.find((l) => l.number === 1).ports,
    "3:2",
  );
  assert.deepEqual(afterImport.bindings, oldBindings);
  await upload("Production corrigée.xlsx");
  await page.getByText(/Box mise à jour/).waitFor();
  await page
    .getByText("Informations de fabrication et câblage", { exact: true })
    .click();
  await checkAxe();
  await page.screenshot({ path: "test-results/box-production-SIMULATION.png" });
  book.Sheets["Infos Box"].B1.v = 141;
  await upload("Production corrigée.xlsx");
  await page.getByRole("heading", { name: "Box 141", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("quasar-box-library")).entries.length,
    ),
    2,
  );
  const library140 = afterImport.id;
  const picker = page.getByRole("button", {
    name: "Changer de Box",
    exact: true,
  });
  await picker.focus();
  await picker.press("ArrowDown");
  const menu = page.getByRole("listbox", { name: "Changer de Box" });
  await menu.waitFor();
  const triggerBounds = await picker.boundingBox(),
    menuBounds = await menu.boundingBox();
  assert.ok(menuBounds.y >= triggerBounds.y + triggerBounds.height);
  await page.screenshot({ path: "test-results/box-dropdown-SIMULATION.png" });
  await menu.press("Escape");
  assert.equal(await picker.getAttribute("aria-expanded"), "false");
  await page
    .getByRole("link", { name: "Ouvrir la Box 141 dans le back-office" })
    .waitFor();

  await page
    .getByRole("button", { name: "Changer de Box", exact: true })
    .click();
  await page
    .getByRole("option", {
      name: "SIMULATION · Atelier personnalisé · #140",
      exact: true,
    })
    .click();
  await page
    .getByRole("heading", {
      name: "SIMULATION · Atelier personnalisé",
      exact: true,
    })
    .waitFor();
  assert.deepEqual(
    await page.evaluate(() => window.__activeBox().bindings),
    oldBindings,
  );
  await page
    .getByRole("button", { name: "Changer de Box", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Box 141 · #141", exact: true })
    .click();
  book.Sheets["Infos Box"].B1.v = 140;
  book.Sheets["Infos Box"].B2 = {
    t: "s",
    v: "Mise à jour depuis une autre Box",
  };
  await upload("Production version 3.xlsx");
  await page
    .getByText("Mise à jour depuis une autre Box", { exact: true })
    .waitFor();
  assert.equal(await page.evaluate(() => window.__activeBox().id), library140);
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("quasar-box-library")).entries.length,
    ),
    2,
  );
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  await nav.getByRole("button", { name: "Mes Box", exact: true }).click();
  assert.equal(await page.locator(".box-library-card").count(), 2);
  await page.getByLabel("Rechercher une Box", { exact: true }).fill("141");
  assert.equal(await page.locator(".box-library-card").count(), 1);
  await page.getByLabel("Rechercher une Box", { exact: true }).fill("");
  await page.screenshot({
    path: "test-results/box-library-light-SIMULATION.png",
  });
  const libraryAxe = await page.evaluate(() =>
    window.axe.run("main,aside", {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    }),
  );
  assert.deepEqual(
    libraryAxe.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    [],
  );
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({
    path: "test-results/box-library-dark-SIMULATION.png",
  });
  const darkLibraryAxe = await page.evaluate(() =>
    window.axe.run("main,aside", {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    }),
  );
  assert.deepEqual(
    darkLibraryAxe.violations.map((v) => v.id),
    [],
  );
  await page
    .getByRole("button", { name: "Réduire la barre latérale", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ouvrir la barre latérale", exact: true })
    .waitFor();
  await page.screenshot({
    path: "test-results/box-library-collapsed-SIMULATION.png",
  });
  await page
    .getByRole("button", { name: "Ouvrir la barre latérale", exact: true })
    .click();
  await page.setViewportSize({ width: 900, height: 900 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "test-results/box-library-compact-SIMULATION.png",
  });
  await page.setViewportSize({ width: 1448, height: 1086 });
  await page
    .getByRole("button", { name: "Créer une Box", exact: true })
    .click();
  editor = page.getByRole("dialog", {
    name: "Créer une Box sans fichier",
    exact: true,
  });
  await editor.getByRole("button", { name: "Enregistrer la Box" }).click();
  await editor
    .getByText("Renseignez l’ID de la Box.", { exact: true })
    .waitFor();
  await editor.getByLabel("ID de la Box", { exact: true }).fill("12");
  await editor.getByRole("button", { name: /Casiers et serrures/ }).click();
  assert.equal(
    await editor.getByLabel("Numéro ligne 1", { exact: true }).isDisabled(),
    true,
  );
  await editor.getByLabel("Numéro ligne 2", { exact: true }).fill("7");
  await editor
    .getByLabel("Ports Southco ligne 2", { exact: true })
    .fill("1:4,2:4");
  await editor.getByRole("button", { name: "Ajouter un casier" }).click();
  await editor.getByLabel("Numéro ligne 3", { exact: true }).fill("8");
  await editor.getByRole("button", { name: "Enregistrer la Box" }).click();
  await editor.waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Box 12" }).waitFor();
  const manual = await page.evaluate(() => window.__activeBox());
  assert.deepEqual(
    manual.box.lockers.map((l) => l.number),
    [0, 7, 8],
  );
  assert.equal(manual.box.lockers[1].ip, "");
  assert.equal(await page.locator(".box-locker.success").count(), 1);
  await page.getByRole("button", { name: /Casier 7 ·/ }).click();
  await page
    .getByRole("heading", { name: "SIMULATION caméra 7", exact: true })
    .waitFor();
  await page
    .getByText("Association automatique · IP du casier conforme.", {
      exact: true,
    })
    .waitFor();
  assert.equal(manual.box.lockers[0].ports, "1:14,2:14");
  assert.deepEqual(manual.bindings, {});
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("quasar-box-library")).entries.length,
    ),
    3,
  );
  await page.getByRole("button", { name: /Casier 7 ·/ }).click();
  await page.getByText("Module 1 · port 4", { exact: true }).last().waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Box", exact: true }).click();
  await page.getByRole("heading", { name: "Box 12" }).waitFor();

  // Optional user-supplied files: kept outside the repository and imported only into this isolated browser.
  for (const filename of process.argv.slice(2)) {
    await page
      .getByLabel("Importer les casiers", { exact: true })
      .setInputFiles(filename);

    await page.waitForFunction(
      (name) => window.__activeBox().box.source?.filename === name,
      path.basename(filename),
    );
    const imported = await page.evaluate(() => window.__activeBox().box);
    assert.ok(imported.metadata?.id);
    assert.ok(imported.metadata?.address);
    assert.equal(imported.lockers.filter((l) => l.kind === "IHM").length, 1);
    await page
      .locator(".camera-workspace.box-mode")
      .evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({
      path:
        "test-results/box-production-" +
        imported.metadata.id.replace(/[^a-zA-Z0-9-]/g, "") +
        "-SIMULATION.png",
    });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/box-mode.json",
    JSON.stringify(
      {
        simulation: true,
        checks: [
          "Classique par défaut",
          "Import XLSX dans un worker",
          "Plan et IHM sans caméra",
          "Couleurs et détail",
          "Axe clair/sombre",
          "Associations uniques",
          "IP par numéro non consécutif",
          "Bilan d’attribution",
          "Persistance de la Box",
          "Affichage compact",
          "Métadonnées de production et ports Southco",
          "Réimport par ID avec associations conservées",
          "Bibliothèque, sélection de Box et réimport de la Box inactive",
          "Formulaire sans fichier, validation et persistance",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Mode Box : parcours simulé réussi, aucun matériel contacté.");
} catch (e) {
  await browser
    .contexts()[0]
    ?.pages()[0]
    ?.screenshot({ path: "test-results/box-mode-failure.png" });
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
