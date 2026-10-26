import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import sharp from "sharp";
import { start, visit } from "./storybook-harness.mjs";
const update = process.argv.includes("--update"),
  h = await start(),
  results = [];
const cases = [
  "pages--cameras",
  "pages--selected-camera",
  "pages--diagnostic-results",
  "pages--add-camera-modal",
  "components--feedback",
  "components--loading-state",
];
try {
  await mkdir("test-results/visual", { recursive: true });
  await mkdir("tests/visual-baselines", { recursive: true });
  for (const theme of ["dark", "light"])
    for (const id of cases) {
      await visit(h, id, theme);
      const name = `${id}-${theme}.png`,
        file = `tests/visual-baselines/${name}`;
      const shot = await h.page.screenshot({ animations: "disabled" });
      await writeFile(`test-results/visual/${name}`, shot);
      if (update) {
        await writeFile(file, shot);
        continue;
      }
      const a = await sharp(shot)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true }),
        b = await sharp(await readFile(file))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
      assert.deepEqual(a.info, b.info, name);
      let changed = 0;
      const diff = Buffer.alloc(a.data.length);
      for (let p = 0; p < a.data.length; p += 4) {
        const delta = Math.max(
          ...[0, 1, 2].map((c) => Math.abs(a.data[p + c] - b.data[p + c])),
        );
        if (delta > 20) {
          changed++;
          diff[p] = 255;
          diff[p + 3] = 255;
        }
      }
      const ratio = changed / (a.info.width * a.info.height);
      results.push({ name, changed, ratio });
      if (ratio > 0.001)
        await sharp(diff, {
          raw: { width: a.info.width, height: a.info.height, channels: 4 },
        })
          .png()
          .toFile(`test-results/visual/diff-${name}`);
    }
  // Reflow at a small desktop size and at 200% equivalent CSS viewport.
  for (const width of [1100, 724]) {
    await h.page.setViewportSize({ width, height: 900 });
    await visit(h, "pages--selected-camera");
    assert.equal(
      await h.page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.querySelector(".workspace").scrollWidth <=
            document.querySelector(".workspace").clientWidth,
      ),
      true,
      `Débordement à ${width}px`,
    );
    await h.page.screenshot({
      path: `test-results/visual/reflow-${width}.png`,
      fullPage: true,
    });
    await h.page.locator(".camera-content").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    assert.equal(
      await h.page.locator(".apply-bar").evaluate((el) => {
        const bounds = el.getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= innerHeight;
      }),
      true,
      `Barre d’actions tronquée à ${width}px`,
    );
    await h.page.screenshot({
      path: `test-results/visual/reflow-${width}-bottom.png`,
    });
  }
  await writeFile(
    "test-results/visual/results.json",
    JSON.stringify({ update, results }, null, 2),
  );
  assert.deepEqual(
    results.filter((x) => x.ratio > 0.001),
    [],
  );
  console.log(
    update
      ? "12 références visuelles créées ; inspection requise."
      : "12 comparaisons visuelles réussies, reflow à 1100 et 724 px.",
  );
} finally {
  await h.close();
}
