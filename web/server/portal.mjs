import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCollector } from "./telemetry.mjs";

// Public portal only. The native application and protected design archive are
// deliberately absent from this runtime's filesystem and protocol.
export function createPortal({ root, origin, metrics }) {
  const allowedHost = new URL(origin).host;
  let windowStart = Date.now(),
    count = 0;
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".json": "application/json",
    ".txt": "text/plain",
  };
  return http.createServer(async (req, res) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    if (req.headers.host !== allowedHost) return res.writeHead(421).end();
    const url = new URL(req.url, origin);
    if (url.pathname === "/healthz" && req.method === "GET")
      return res.writeHead(200).end("ok");
    if (url.pathname === "/api/metrics/browser" && req.method === "POST") {
      if (
        req.headers.origin !== origin ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        return res.writeHead(403).end();
      if (req.headers["content-type"]?.split(";")[0] !== "application/json")
        return res.writeHead(415).end();
      if (Date.now() - windowStart >= 60000) {
        windowStart = Date.now();
        count = 0;
      }
      if (++count > 120) return res.writeHead(429).end();
      if (Number(req.headers["content-length"] || 0) > 16384)
        return res.writeHead(413).end();
      let size = 0;
      const chunks = [];
      const timer = setTimeout(() => {
        res.writeHead(408).end();
        req.destroy();
      }, 1500);
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16384) {
            res.writeHead(413).end();
            return;
          }
          chunks.push(chunk);
        }
        const values = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const valid =
          Array.isArray(values) &&
          values.length > 0 &&
          values.length <= 50 &&
          values.every(
            (value) =>
              value &&
              Object.keys(value).length === 3 &&
              value.screen === "home" &&
              ["page_view", "error", "lcp_ms", "inp_ms", "cls"].includes(
                value.name,
              ) &&
              typeof value.value === "number" &&
              Number.isFinite(value.value) &&
              value.value >= 0 &&
              value.value <= (value.name === "cls" ? 10 : 120000),
          );
        if (!valid) return res.writeHead(400).end();
        for (const value of values) metrics.record(value);
        return res.writeHead(204).end();
      } catch {
        if (!res.headersSent) res.writeHead(400).end();
      } finally {
        clearTimeout(timer);
      }
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) return res.writeHead(405).end();
    const started = performance.now();
    // Closed file paths: never expose arbitrary files or the technical archive.
    const page = /^\/(?:fr\/|en\/)?$/.test(url.pathname);
    const publicFile =
      /^\/(?:robots\.txt|version\.json|manifest\.json|SHA256SUMS\.txt|static\/[a-zA-Z0-9._-]+)$/.test(
        url.pathname,
      );
    if (!page && !publicFile) return res.writeHead(404).end();
    try {
      const filename = path.join(
        root,
        page ? url.pathname + "index.html" : url.pathname,
      );
      let bytes = await readFile(filename);
      if (page)
        bytes = Buffer.from(
          bytes
            .toString("utf8")
            .replace(
              'data-metrics="disabled"',
              `data-metrics="${metrics.enabled ? "enabled" : "disabled"}"`,
            ),
        );
      res.setHeader(
        "Content-Type",
        mime[path.extname(filename)] || "application/octet-stream",
      );
      res.writeHead(200).end(req.method === "HEAD" ? undefined : bytes);
      if (page)
        metrics.record({
          screen: "home",
          name: "server_ms",
          value: Math.min(120000, performance.now() - started),
        });
    } catch {
      res.writeHead(404).end();
    }
  });
}

export function startPortal(env = process.env) {
  const origin = env.PUBLIC_ORIGIN || "http://127.0.0.1:4350";
  if (
    env.NODE_ENV === "production" &&
    origin !== "https://quasar.doublemart.fr"
  )
    throw Error("Invalid public portal origin");
  const metrics = createCollector({ secret: env.PLATFORM_METRICS_TOKEN });
  const server = createPortal({
    root: path.resolve(env.PORTAL_ROOT || "site-dist"),
    origin,
    metrics,
  });
  server.listen(Number(env.PORT || 4350), env.HOST || "127.0.0.1");
  server.on("close", () => metrics.close());
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  return server;
}
