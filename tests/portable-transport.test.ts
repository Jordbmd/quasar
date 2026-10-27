import { it, expect } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { vendorHttpNode } from "../src/main/vendor-transport";
it("transport portable : POST exact, source, refus HTTP, aucune redirection, annulation et réponse tronquée", async () => {
  const seen: string[] = [];
  const server = http.createServer((req, res) => {
    seen.push(req.url!);
    expect(req.socket.remoteAddress).toBe("127.0.0.1");
    expect(req.headers["content-type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "http://192.0.2.1/forbidden" });
      res.end();
    } else if (req.url === "/refused") {
      res.writeHead(401);
      res.end("refused");
    } else if (req.url === "/slow") req.resume();
    else if (req.url === "/partial") {
      res.writeHead(200, { "Content-Length": "100" });
      res.write("<ok");
      setImmediate(() => res.destroy());
    } else {
      let body = "";
      req.on("data", (b) => (body += b));
      req.on("end", () => {
        expect(body).toBe("<fixture/>");
        res.end("<Success/>");
      });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = {
    ip: "127.0.0.1",
    port: (server.address() as AddressInfo).port,
    source: "127.0.0.1",
    body: "<fixture/>",
  };
  try {
    expect(await vendorHttpNode({ ...base, endpoint: "/ok" })).toEqual({
      status: 200,
      xml: "<Success/>",
    });
    expect(
      (await vendorHttpNode({ ...base, endpoint: "/redirect" })).status,
    ).toBe(302);
    expect(
      (await vendorHttpNode({ ...base, endpoint: "/refused" })).status,
    ).toBe(401);
    const controller = new AbortController();
    const pending = vendorHttpNode({
      ...base,
      endpoint: "/slow",
      signal: controller.signal,
    });
    controller.abort(Error("cancelled fixture"));
    await expect(pending).rejects.toThrow("cancelled fixture");
    await expect(
      vendorHttpNode({ ...base, endpoint: "/partial" }),
    ).rejects.toThrow();
    expect(seen).not.toContain("/forbidden");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
