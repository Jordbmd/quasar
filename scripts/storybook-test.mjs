import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { start, visit } from "./storybook-harness.mjs";
const require = createRequire(import.meta.url),
  h = await start(),
  errors = [],
  results = [];
h.page.on("pageerror", (e) => errors.push(e.message));
try {
  const index = JSON.parse(
    await readFile("storybook-static/index.json", "utf8"),
  );
  const stories = Object.values(index.entries).filter(
    (e) => e.type === "story",
  );
  const axe = await readFile(require.resolve("axe-core"), "utf8");
  for (const theme of ["dark", "light"])
    for (const story of stories) {
      await visit(h, story.id, theme);
      await h.page.evaluate(axe);
      const violations = await h.page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
            },
          })
        ).violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      );
      results.push({ id: story.id, theme, violations });
      if (violations.length)
        console.log(story.id, theme, JSON.stringify(violations));
    }
  await visit(h, "components--modals");
  const open = h.page.getByRole("button", { name: "Ouvrir la confirmation" });
  await open.click();
  await h.page.getByRole("dialog").waitFor();
  for (let i = 0; i < 8; i++) {
    await h.page.keyboard.press("Tab");
    assert.equal(
      await h.page.evaluate(() => !!document.activeElement.closest("dialog")),
      true,
    );
  }
  await h.page.keyboard.press("Escape");
  assert.equal(await open.evaluate((e) => e === document.activeElement), true);
  await visit(h, "pages--cameras");
  await h.page.emulateMedia({ colorScheme: "dark" });
  await h.page.evaluate(() => localStorage.removeItem("sezaam-theme"));
  await h.page.emulateMedia({ colorScheme: "light" });
  await h.page.waitForFunction(()=>document.documentElement.dataset.theme==="light");
  assert.equal(await h.page.locator("html").getAttribute("data-theme"), "light");
  await h.page.emulateMedia({ colorScheme: "dark" });
  await h.page.waitForFunction(()=>document.documentElement.dataset.theme==="dark");
  assert.equal(await h.page.locator("html").getAttribute("data-theme"), "dark");
  await h.page.getByRole("button", { name: "Activer le thème clair" }).click();
  await h.page.emulateMedia({ colorScheme: "light" });
  await h.page.emulateMedia({ colorScheme: "dark" });
  await h.page.waitForFunction(()=>document.documentElement.dataset.theme==="light");
  assert.equal(await h.page.locator("html").getAttribute("data-theme"), "light");
  await visit(h, "pages--selected-camera");
  await h.page.getByRole("button",{name:"Agrandir l’aperçu"}).click();
  await h.page.getByRole("dialog",{name:"Aperçu vidéo agrandi"}).waitFor();
  for(let i=0;i<5;i++){await h.page.keyboard.press("Tab");assert.equal(await h.page.evaluate(()=>!!document.activeElement.closest('.preview.expanded')),true);}
  await h.page.keyboard.press("Escape");
  await h.page.getByLabel("FPS (images/s)",{exact:true}).fill("20");
  await h.page.getByRole("button",{name:/Diagnostic Tests/}).click();
  await h.page.getByRole("dialog",{name:"Modifications non enregistrées"}).waitFor();
  await h.page.getByRole("button",{name:"Continuer la modification"}).click();
  assert.equal(await h.page.getByLabel("FPS (images/s)",{exact:true}).inputValue(),"20");
  await h.page.getByRole("button",{name:/Diagnostic Tests/}).click();
  await h.page.getByRole("button",{name:"Abandonner les modifications"}).click();
  await h.page.getByRole("heading",{name:"Diagnostic des caméras",exact:true}).waitFor();
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/storybook.json",
    JSON.stringify({ results, errors, externalRequests: h.external }, null, 2),
  );
  assert.deepEqual(
    results.filter((r) => r.violations.length),
    [],
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(h.external, []);
  console.log(
    `${stories.length} stories × 2 thèmes : Axe, rendu, clavier/modal et thèmes système/manuels réussis. Aucun accès externe.`,
  );
} finally {
  await h.close();
}
