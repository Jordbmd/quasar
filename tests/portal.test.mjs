import { test } from "vitest";
import assert from "node:assert/strict";
import { createPortal } from "../web/server/portal.mjs";
import { createCollector } from "../web/server/telemetry.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";

// Node fetch normalizes Host; use the real HTTP transport to exercise vhosts.
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method: options.method || "GET", headers: options.headers },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: new Headers(res.headers),
            text: async () => Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}
test("public runtime bounds metrics, rejects private payloads and never exposes assets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "quasar-portal-"));
  await mkdir(path.join(root, "fr"));
  await writeFile(
    path.join(root, "fr/index.html"),
    '<body data-metrics="disabled">public</body>',
  );
  await writeFile(path.join(root, "private.txt"), "must not leave");
  const records = [];
  const server = createPortal({
    root,
    origin: "https://quasar.doublemart.fr",
    metrics: { enabled: true, record: (value) => records.push(value) },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    Host: "quasar.doublemart.fr",
    Origin: "https://quasar.doublemart.fr",
    "Content-Type": "application/json",
  };
  const post = (body) =>
    fetch(origin + "/api/metrics/browser", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(origin + "/fr/")).status, 421);
    const page = await fetch(origin + "/fr/", { headers });
    assert.match(await page.text(), /data-metrics="enabled"/);
    assert.match(page.headers.get("x-robots-tag"), /noindex/);
    assert.equal(records.length, 1); // server duration, no duplicate browser view
    const metric = { screen: "home", name: "cls", value: 0.04 };
    assert.equal((await post([metric])).status, 204);
    assert.deepEqual(records[1], metric);
    for (const bad of [
      [{ ...metric, url: "private" }],
      [{ ...metric, screen: "camera" }],
      [{ ...metric, value: 11 }],
      Array(51).fill(metric),
      [{ ...metric, name: "server_ms" }],
    ])
      assert.equal((await post(bad)).status, 400);
    assert.equal(records.length, 2);
    assert.equal(
      (
        await fetch(origin + "/api/metrics/browser", {
          method: "POST",
          headers: { ...headers, Origin: "https://other.invalid" },
          body: "[]",
        })
      ).status,
      403,
    );
    assert.equal(
      (await post([{ ...metric, padding: "x".repeat(17000) }])).status,
      413,
    );
    for (const file of [
      "/private.txt",
      "/storybook/iframe.html",
      "/assets.zip",
      "/../package.json",
    ]) {
      const response = await fetch(origin + file, { headers });
      assert.equal(response.status, 404);
      assert.match(response.headers.get("x-robots-tag"), /noindex/);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
test("collector uses bounded batches and drops a failed batch after one retry", async () => {
  let calls = 0;
  const metrics = createCollector({
    secret: "synthetic",
    fetchImpl: async (_url, request) => {
      calls++;
      const values = JSON.parse(request.body);
      assert.equal(values.length, 50);
      assert.equal(values[0].project, "quasar");
      throw Error("offline");
    },
    intervalMs: 60000,
  });
  for (let i = 0; i < 240; i++)
    metrics.record({ screen: "home", name: "page_view", value: 1 });
  assert.equal(metrics.size(), 200);
  await metrics.flush();
  assert.equal(calls, 2);
  assert.equal(metrics.size(), 150);
  metrics.close();
  assert.equal(metrics.size(), 0);
});
