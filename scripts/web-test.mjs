import { readFile, mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
const require = createRequire(import.meta.url),
  axe = await readFile(require.resolve("axe-core"), "utf8");
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
});
const results = [];
await mkdir("test-results/web", { recursive: true });
try {
  for (const directory of ["site-dist", "assets-dist"]) {
    const root = path.resolve(directory);
    const manifest = JSON.parse(await readFile(`${root}/version.json`, "utf8"));
    assert.match(manifest.commit, /^[a-f0-9]{40}$/);
    assert.equal(manifest.project, "quasar");
    assert.equal(manifest.published, false);
    for (const file of manifest.files) {
      const bytes = await readFile(path.join(root, file.file));
      assert.equal(bytes.length, file.bytes, file.file);
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        file.sha256,
        file.file,
      );
    }
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, "http://127.0.0.1");
        const target = path.resolve(
          root,
          "." +
            decodeURIComponent(url.pathname) +
            (url.pathname.endsWith("/") ? "index.html" : ""),
        );
        if (!target.startsWith(root + path.sep)) throw Error();
        const mime = {
          ".html": "text/html",
          ".css": "text/css",
          ".js": "text/javascript",
          ".json": "application/json",
          ".svg": "image/svg+xml",
          ".woff2": "font/woff2",
        };
        res.setHeader(
          "content-type",
          mime[path.extname(target)] || "application/octet-stream",
        );
        res.end(await readFile(target));
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const external = [],
      errors = [];
    await context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.origin !== origin && !["data:", "blob:"].includes(u.protocol)) {
        external.push(u.origin);
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      for (const lang of ["fr", "en"])
        for (const theme of ["light", "dark"]) {
          const response = await page.goto(`${origin}/${lang}/`);
          assert.equal(response.status(), 200);
          assert.equal(await page.locator("html").getAttribute("lang"), lang);
          assert.equal(
            await page.locator('meta[name="robots"]').getAttribute("content"),
            "noindex,nofollow",
          );
          await page.locator("[data-theme-choice]").selectOption(theme);
          await page.waitForFunction(
            (t) => document.documentElement.dataset.theme === t,
            theme,
          );
          await page.evaluate(axe);
          const violations = await page.evaluate(async () =>
            (await window.axe.run(document)).violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => n.target),
            })),
          );
          assert.deepEqual(violations, []);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          await page.screenshot({
            path: `test-results/web/${directory}-${lang}-${theme}.png`,
            fullPage: true,
          });
          results.push({ directory, lang, theme, violations });
        }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(origin + "/en/");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: `test-results/web/${directory}-mobile.png`,
        fullPage: true,
      });
      const language = page.locator('a[hreflang="fr"]');
      await language.click();
      assert.equal(new URL(page.url()).pathname, "/fr/");
      if (directory === "assets-dist") {
        await page.goto(
          `${origin}/storybook/iframe.html?id=pages--cameras&viewMode=story&globals=language:en;theme:dark`,
        );
        await page
          .getByRole("heading", { name: "Cameras", exact: true })
          .waitFor();
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
    } finally {
      await context.close();
      await new Promise((r) => server.close(r));
    }
  }
  await writeFile(
    "test-results/web/report.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    "Public portal and protected asset artifact: FR/EN, themes, mobile, Axe, nested Storybook, zero external requests.",
  );
} finally {
  await browser.close();
}
