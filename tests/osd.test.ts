import { describe, it, expect, vi } from "vitest";
import http from "node:http";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { CameraConnection } from "../src/main/onvif";
import { CameraService } from "../src/main/service";
import { Diagnostics } from "../src/main/diagnostics";
import {
  OSDStore,
  parseOSDs,
  osdPayload,
  parseXML,
  nodes,
  signature,
  parseOSDOptions,
} from "../src/main/osd";
import type { Camera } from "../src/shared/types";
const ns = "http://www.onvif.org/ver10/media/wsdl";
const envelope = (body: string) =>
  `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tt="http://www.onvif.org/ver10/schema" xmlns:vendor="urn:test:vendor"><s:Body>${body}</s:Body></s:Envelope>`;
const object = (token: string, text = "Atelier &amp; test") =>
  `<trt:OSDs token="${token}" xmlns:trt="${ns}"><tt:VideoSourceConfigurationToken>source1</tt:VideoSourceConfigurationToken><tt:Type>Text</tt:Type><tt:Position><tt:Type>Custom</tt:Type><tt:Pos x="0" y="-0.5"/></tt:Position><tt:TextString IsPersistentText="true"><tt:Type>Plain</tt:Type><tt:PlainText>${text}</tt:PlainText><tt:FontSize>0</tt:FontSize><tt:FontColor><tt:Color X="0" Y="0" Z="0" Colorspace="http://www.onvif.org/ver10/colorspace/RGB"/></tt:FontColor><tt:BackgroundColor><tt:Transparent>0</tt:Transparent></tt:BackgroundColor></tt:TextString><tt:Extension><vendor:Keep attribute="yes">Original</vendor:Keep></tt:Extension></trt:OSDs>`;
const response = (items: string[]) =>
  envelope(
    `<trt:GetOSDsResponse xmlns:trt="${ns}">${items.join("")}</trt:GetOSDsResponse>`,
  );
async function fixture() {
  let objects = [object("osd1"), object("osd2", "Deuxième")];
  const writes: string[] = [];
  let failDelete = "";
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const action = String(req.headers["content-type"]).match(
        /action="[^\"]*\/([^\"]+)"/,
      )?.[1];
      res.setHeader("Content-Type", "application/soap+xml");
      if (action === "GetOSDs") return res.end(response(objects));
      if (action === "GetOSDOptions")
        return res.end(
          envelope(
            `<trt:GetOSDOptionsResponse xmlns:trt="${ns}"><trt:OSDOptions><tt:MaximumNumberOfOSDs Total="4" PlainText="3" DateAndTime="1"/><tt:Type>Text</tt:Type><tt:PositionOption>UpperLeft</tt:PositionOption><tt:PositionOption>Custom</tt:PositionOption><tt:TextOption><tt:Type>Plain</tt:Type><tt:Type>DateAndTime</tt:Type><tt:FontSizeRange><tt:Min>10</tt:Min><tt:Max>36</tt:Max></tt:FontSizeRange><tt:DateFormat>dd/MM/yyyy</tt:DateFormat><tt:TimeFormat>HH:mm:ss</tt:TimeFormat></tt:TextOption></trt:OSDOptions></trt:GetOSDOptionsResponse>`,
          ),
        );
      writes.push(body);
      if (action === "DeleteOSD") {
        const token = body.match(/<OSDToken>([^<]+)<\/OSDToken>/)?.[1];
        if (token === failDelete)
          return res.end(
            envelope(
              "<s:Fault><s:Code><s:Value>s:Receiver</s:Value></s:Code><s:Reason><s:Text>ActionNotSupported</s:Text></s:Reason></s:Fault>",
            ),
          );
        objects = objects.filter((x) => !x.includes(`token="${token}"`));
        return res.end(envelope(`<trt:DeleteOSDResponse xmlns:trt="${ns}"/>`));
      }
      if (action === "CreateOSD" || action === "SetOSD") {
        const fragment = body.match(/<sz:OSD\b[\s\S]*?<\/sz:OSD>/)?.[0];
        if (!fragment) {
          res.statusCode = 400;
          return res.end("missing OSD");
        }
        let rebuilt = fragment.replace(/sz:OSD\b/g, "sz:OSDs");
        const originalToken = fragment.match(/token="([^"]*)"/)?.[1];
        if (action === "CreateOSD")
          rebuilt = rebuilt.replace('token=""', `token="new${objects.length}"`);
        else
          objects = objects.filter(
            (x) => !x.includes(`token="${originalToken}"`),
          );
        objects.push(rebuilt);
        return res.end(envelope(`<trt:${action}Response xmlns:trt="${ns}"/>`));
      }
      res.statusCode = 500;
      res.end("unexpected");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;
  const camera: Camera = {
    id: "3a1e75c0-6f90-4ba5-a62b-3e48d213b8d0",
    ip: "127.0.0.1",
    port,
    path: "/onvif/device_service",
    status: "test uniquement",
    ambiguous: false,
    serial: "TEST-SERIAL",
    model: "SIMULATEUR",
    manufacturer: "TEST",
    mac: "aa:bb:cc:dd:ee:ff",
  };
  const guard: any = {
    epoch: 1,
    assert: vi.fn(async () => ({ address: "127.0.0.1", id: "lo0" })),
    ensureEpoch: vi.fn(),
    onSuspend: vi.fn(),
  };
  const log = new Diagnostics();
  const conn = new CameraConnection(
    camera,
    { username: "test", password: "secret-fixture" },
    guard,
    log,
    "127.0.0.1",
  );
  conn.cam.uri = { media: { path: "/media" } };
  conn.cam.media2Support = false;
  conn.cam.profiles = [
    { videoSourceConfiguration: { $: { token: "source1" } } },
  ];
  const dir = await mkdtemp(path.join(tmpdir(), "sezaam-osd-"));
  const store = new OSDStore(dir);
  const service = new CameraService(
    guard,
    log,
    { stop: vi.fn(async () => {}) } as any,
    async () => true,
    async () => {},
    async () => "",
    store,
  );
  service.cameras = [camera];
  service.connections.set(camera.id, conn);
  service.approve = vi.fn(async () => conn);
  return {
    camera,
    conn,
    service,
    writes,
    store,
    dir,
    fail: (token: string) => (failDelete = token),
    close: async () => {
      conn.destroy();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
describe("OSD — commandes réelles sur simulateur SOAP local", () => {
  it("préserve les attributs, les couleurs à zéro et les extensions en sérialisant", () => {
    const o = parseOSDs(response([object("01")]))[0];
    const xml = osdPayload(o, ns, true);
    expect(xml).toContain('xmlns:vendor="urn:test:vendor"');
    expect(xml).toContain('X="0"');
    expect(xml).toContain('IsPersistentText="true"');
    expect(xml).toContain("vendor:Keep");
    expect(signature(xml)).toBe(o.signature);
    expect(parseOSDs(response([]))).toEqual([]);
    expect(() => parseXML("<!DOCTYPE x><x/>")).toThrow();
  });
  it("supprime tous les OSD, relit leur absence et restaure les objets complets", async () => {
    const f = await fixture();
    try {
      const result = await f.service.disableOSD({ id: f.camera.id });
      expect(result).toMatchObject({
        sent: true,
        acknowledged: true,
        verified: true,
      });
      expect(await f.conn.osds()).toHaveLength(0);
      const saved = await f.store.read(f.camera);
      expect(saved?.objects).toHaveLength(2);
      expect(
        await f.store.read({ ...f.camera, serial: "AUTRE" }),
      ).toBeUndefined();
      const savedText = await readFile(
        path.join(f.dir, (await readdir(f.dir))[0]),
        "utf8",
      );
      expect(savedText).not.toContain("secret-fixture");
      const restored = await f.service.restoreOSD(f.camera.id);
      expect(restored.verified).toBe(true);
      expect(await f.conn.osds()).toHaveLength(2);
      const writes = f.writes.length;
      expect((await f.service.restoreOSD(f.camera.id)).sent).toBe(false);
      expect(f.writes).toHaveLength(writes);
      await f.service.disableOSD({ id: f.camera.id });
      expect((await f.store.read(f.camera))?.objects).toHaveLength(2);
      expect((await f.service.restoreOSD(f.camera.id)).verified).toBe(true);
      expect(await f.conn.osds()).toHaveLength(2);
    } finally {
      await f.close();
    }
  });
  it("ne prétend pas réussir après une suppression partielle et ne rejoue pas", async () => {
    const f = await fixture();
    try {
      f.fail("osd2");
      const r = await f.service.disableOSD({ id: f.camera.id });
      expect(r.verified).toBe(false);
      expect(r.results?.filter((x) => x.verified)).toHaveLength(1);
      expect(f.service.uncertain.has(f.camera.id)).toBe(true);
      expect(f.writes).toHaveLength(2);
      expect((await f.store.read(f.camera))?.objects).toHaveLength(2);
    } finally {
      await f.close();
    }
  });
  it("modifie le texte via SetOSD sans détruire les autres propriétés", async () => {
    const f = await fixture();
    try {
      const r = await f.service.editOSD({
        id: f.camera.id,
        token: "osd1",
        text: 'Zone <A> & "B"',
      });
      expect(r.verified).toBe(true);
      const got = await f.conn.osds();
      expect(got.find((o) => o.token === "osd1")?.text).toBe('Zone <A> & "B"');
      expect(f.writes[0]).toContain("BackgroundColor");
      expect(f.writes[0]).toContain("vendor:Keep");
      expect(got).toHaveLength(2);
    } finally {
      await f.close();
    }
  });
  it("refuse un token périmé sans écrire", async () => {
    const f = await fixture();
    try {
      await expect(
        f.service.disableOSD({ id: f.camera.id, tokens: ["inconnu"] }),
      ).rejects.toThrow("disparu");
      expect(f.writes).toHaveLength(0);
    } finally {
      await f.close();
    }
  });
  it("crée une incrustation depuis les capacités lues puis vérifie sa présence", async () => {
    const f = await fixture();
    try {
      const caps = await f.conn.osdOptions("source1");
      expect(caps).toMatchObject({
        types: ["Text"],
        textTypes: ["Plain", "DateAndTime"],
        maximum: { Total: 4 },
        fontSize: { min: 10, max: 36 },
      });
      const created = await f.service.dispatch("createOSD", {
        id: f.camera.id,
        source: "source1",
        textType: "DateAndTime",
        position: "UpperLeft",
        dateFormat: "dd/MM/yyyy",
        timeFormat: "HH:mm:ss",
        fontSize: 18,
      });
      expect(created.verified).toBe(true);
      expect(await f.conn.osds()).toHaveLength(3);
      const osd = (await f.conn.osds()).find(
        (o) => o.textType === "DateAndTime",
      )!;
      expect(osd).toMatchObject({
        fontSize: 18,
        dateFormat: "dd/MM/yyyy",
        timeFormat: "HH:mm:ss",
        position: "UpperLeft",
      });
      await f.service.disableOSD({ id: f.camera.id, tokens: [osd.token] });
      expect((await f.service.restoreOSD(f.camera.id)).verified).toBe(true);
      expect(
        (await f.conn.osds()).some((o) => o.textType === "DateAndTime"),
      ).toBe(true);
    } finally {
      await f.close();
    }
  });
  it("refuse une création hors capacités avant toute écriture", async () => {
    const f = await fixture();
    try {
      await expect(
        f.service.dispatch("createOSD", {
          id: f.camera.id,
          source: "source1",
          textType: "Plain",
          position: "LowerRight",
          text: "Test",
        }),
      ).rejects.toThrow("Position");
      await expect(
        f.service.dispatch("createOSD", {
          id: f.camera.id,
          source: "inconnue",
          textType: "Plain",
          position: "UpperLeft",
          text: "Test",
        }),
      ).rejects.toThrow("Source");
      await expect(
        f.service.dispatch("createOSD", {
          id: f.camera.id,
          source: "source1",
          textType: "Plain",
          position: "UpperLeft",
          fontSize: 99,
          text: "Test",
        }),
      ).rejects.toThrow("Taille");
      expect(f.writes).toHaveLength(0);
    } finally {
      await f.close();
    }
  });
  it("modifie la position et la taille en conservant couleurs et extensions", async () => {
    const f = await fixture();
    try {
      expect(
        (
          await f.service.editOSD({
            id: f.camera.id,
            token: "osd1",
            position: "Custom",
            x: 0.3,
            y: -0.2,
            fontSize: 24,
          })
        ).verified,
      ).toBe(true);
      expect((await f.conn.osds())[1]).toMatchObject({
        position: "Custom",
        x: 0.3,
        y: -0.2,
        fontSize: 24,
      });
      expect(f.writes[0]).toContain('X="0"');
      expect(f.writes[0]).toContain("vendor:Keep");
    } finally {
      await f.close();
    }
  });
});
