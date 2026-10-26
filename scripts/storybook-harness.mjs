import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
export async function start() {
  const root = path.resolve("storybook-static");
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const file = path.resolve(
        root,
        "." +
          (url.pathname === "/"
            ? "/index.html"
            : decodeURIComponent(url.pathname)),
      );
      if (!file.startsWith(root + path.sep)) throw Error();
      const mime = {
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ttf": "font/ttf",
        ".woff2": "font/woff2",
      };
      res.setHeader("Content-Type", mime[path.extname(file)] || "text/html");
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1448, height: 1086 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    reducedMotion: "reduce",
  });
  const external = [];
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== url && !["data:", "blob:"].includes(u.protocol)) {
      external.push(u.origin);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  return {
    page,
    context,
    url,
    external,
    close: async () => {
      await browser.close();
      await new Promise((r) => server.close(r));
    },
  };
}
export async function visit(h, id, theme = "dark") {
  await h.page.goto(
    `${h.url}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`,
  );
  await h.page.waitForFunction(
    () =>
      document.querySelector("#storybook-root")?.children.length &&
      !document.querySelector("#error-message")?.textContent,
  );
  await h.page.evaluate(() => document.fonts.ready);
  await h.page.waitForTimeout(350);
  if (id === "pages--selected-camera")
    await h.page.getByLabel("FPS (images/s)", { exact: true }).waitFor();
  if (id !== "pages--add-camera-modal")
    await h.page.evaluate(() => window.scrollTo(0, 0));
  if (id === "pages--add-camera-modal")
    await h.page.getByRole("dialog").waitFor();
}
