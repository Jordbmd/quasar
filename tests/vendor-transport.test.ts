import { expect, it } from "vitest";
import http from "node:http";
import { CameraConnection } from "../src/main/onvif";
import { CameraService } from "../src/main/service";
import { Diagnostics } from "../src/main/diagnostics";
import { ProfileJournal } from "../src/main/profile-journal";
import { vendorFingerprint } from "../src/main/vendor-profile";
it("envoie le format web exact et signale champ par champ une valeur ignorée, sans répéter l’écriture", async () => {
  let writes = 0;
  let capture = {
    "@_Brightness": "128",
    "@_Contrast": "128",
    "@_Keep": "untouched",
  };
  let ignore = false;
  let omitContrastAfterWrite = false;
  let omitContrast = false;
  const seen: any[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (b) => (body += b));
    req.on("end", () => {
      seen.push({ url: req.url, type: req.headers["content-type"], body });
      res.setHeader("Content-Type", "text/xml");
      if (req.url === "/setMediaVideoCaptureConfig") {
        writes++;
        if (omitContrastAfterWrite) omitContrast = true;
        if (!ignore) {
          const match = /Brightness="(\d+)"/.exec(body);
          if (match) capture["@_Brightness"] = match[1];
        }
        res.end("<Success/>");
      } else
        res.end(
          `<Video><Capture Brightness="${capture["@_Brightness"]}" ${omitContrast ? "" : 'Contrast="128"'} Keep="untouched"/></Video>`,
        );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const log = new Diagnostics(),
    guard: any = { epoch: 1, assert: async () => {}, ensureEpoch: () => {} };
  const conn = new CameraConnection(
    {
      id: "fixture",
      ip: "127.0.0.1",
      port: (server.address() as any).port,
      path: "/onvif/device_service",
      status: "",
      ambiguous: false,
    },
    { username: "fixture", password: "test-only" },
    guard,
    log,
    "127.0.0.1",
  );
  const service: any = Object.create(CameraService.prototype);
  Object.assign(service, {
    connections: new Map([["fixture", conn]]),
    uncertain: new Set(),
    log,
    profileJournal: new ProfileJournal(),
    approve: async () => conn,
  });
  try {
    const input = {
      id: "fixture",
      group: "capture",
      values: { brightness: 129 },
      fingerprint: vendorFingerprint(capture),
    };
    const result = await service.setVendorDefaults(input);
    expect(result).toMatchObject({
      sent: true,
      acknowledged: true,
      verified: true,
      fields: { brightness: { observed: 129, verified: true } },
    });
    expect(writes).toBe(1);
    expect(service.uncertain.size).toBe(0);
    ignore = true;
    const failed = await service.setVendorDefaults({
      ...input,
      values: { brightness: 130 },
      fingerprint: vendorFingerprint(capture),
    });
    expect(failed).toMatchObject({
      sent: true,
      acknowledged: true,
      verified: false,
      fields: { brightness: { observed: 129, verified: false } },
    });
    expect(failed.issues.at(-1).code).toBe("READBACK_MISMATCH");
    expect(writes).toBe(2);
    expect(service.uncertain.has("fixture")).toBe(true);
    expect(
      seen.every((x) => x.type === "application/x-www-form-urlencoded"),
    ).toBe(true);
    expect(seen.every((x) => !x.body.includes("test-only"))).toBe(true);
    await expect(
      conn.vendorRequest("/setSystemFactoryDefault"),
    ).rejects.toThrow("non autorisée");
    expect(writes).toBe(2);
    ignore = false;
    omitContrastAfterWrite = true;
    const partial = await service.setVendorDefaults({
      ...input,
      values: { brightness: 130, contrast: 130 },
      fingerprint: vendorFingerprint(capture),
    });
    expect(partial).toMatchObject({
      verified: false,
      fields: {
        brightness: { observed: 130, verified: true },
        contrast: { verified: false, issues: [{ code: "READBACK_FAILED" }] },
      },
    });
    expect(writes).toBe(3);
  } finally {
    conn.destroy();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

it("accepte HTTP 202 puis attend la valeur appliquée sans renvoyer la commande", async () => {
  let writes = 0,
    reads = 0;
  let readStatus = 200,
    writeStatus = 202,
    fault = false;
  const server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      const writing = req.url === "/setMediaVideoCaptureConfig";
      if (writing) {
        writes++;
        res.statusCode = writeStatus;
        res.end(fault ? "<Fault>rejected</Fault>" : "");
      } else {
        reads++;
        res.statusCode = readStatus;
        res.end(
          `<Video><Capture Brightness="${reads > 1 ? 129 : 128}"/></Video>`,
        );
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const log = new Diagnostics();
  const conn = new CameraConnection(
    {
      id: "fixture",
      ip: "127.0.0.1",
      port: (server.address() as any).port,
      path: "/onvif/device_service",
      status: "",
      ambiguous: false,
    },
    { username: "fixture", password: "test-only" },
    { epoch: 1, assert: async () => {}, ensureEpoch: () => {} } as any,
    log,
    "127.0.0.1",
  );
  const service: any = Object.create(CameraService.prototype);
  Object.assign(service, {
    connections: new Map([["fixture", conn]]),
    uncertain: new Set(),
    log,
  });
  try {
    const result = await service.writeAndVerify(
      "fixture",
      () =>
        conn.vendorRequest(
          "/setMediaVideoCaptureConfig",
          '<Video><Capture Brightness="129"/></Video>',
        ),
      async () =>
        (await conn.vendorRequest("/getMediaVideoConfig")).includes(
          'Brightness="129"',
        ),
    );
    expect(result).toMatchObject({
      sent: true,
      acknowledged: true,
      verified: true,
    });
    expect(writes).toBe(1);
    expect(reads).toBe(2);
    expect(service.uncertain.size).toBe(0);
    writeStatus = 204;
    await expect(
      conn.vendorRequest("/setMediaVideoCaptureConfig", "<Video/>"),
    ).resolves.toBe("");
    writeStatus = 200;
    fault = true;
    await expect(
      conn.vendorRequest("/setMediaVideoCaptureConfig", "<Video/>"),
    ).rejects.toThrow("refusée");
    readStatus = 202;
    await expect(conn.vendorRequest("/getMediaVideoConfig")).rejects.toThrow(
      "202",
    );
    readStatus = 403;
    await expect(conn.vendorRequest("/getMediaVideoConfig")).rejects.toThrow(
      "Authentification",
    );
  } finally {
    conn.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
