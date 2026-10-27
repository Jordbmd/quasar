// These tests use only loopback simulators. They never contact a physical camera.
import { describe, it, expect, vi } from "vitest";
import http from "node:http";
import net from "node:net";
import { WebSocket } from "ws";
import { mkdtemp, mkdir, copyFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CameraConnection, token, array } from "../src/main/onvif";
import { Diagnostics } from "../src/main/diagnostics";
import { VideoRelay, RTSPResponseGuard } from "../src/main/video";
import type { NetworkGuard } from "../src/main/network";
const envelope = (body: string) =>
  `<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tt="http://www.onvif.org/ver10/schema"><s:Body>${body}</s:Body></s:Envelope>`;
const camera = {
  id: "mock-id",
  ip: "127.0.0.1",
  port: 0,
  path: "/onvif/device_service",
  ambiguous: false,
  status: "simulation",
};
const guard = () =>
  ({
    epoch: 1,
    assert: vi.fn(async () => ({ address: "127.0.0.1", id: "lo0" })),
    ensureEpoch: vi.fn(),
  }) as unknown as NetworkGuard;
async function start(server: http.Server | net.Server) {
  await new Promise<void>((r, j) => {
    server.once("error", j);
    server.listen(0, "127.0.0.1", r);
  });
  return (server.address() as net.AddressInfo).port;
}
async function close(server: http.Server | net.Server) {
  await new Promise<void>((r) => server.close(() => r()));
}
describe("ONVIF 0.8.3 avec serveur SOAP simulé local", () => {
  it("annule une lecture HTTP lente sans fermer la session ni attendre le timeout", async () => {
    let received!: () => void;
    const firstRequest = new Promise<void>((resolve) => {
      received = resolve;
    });
    let count = 0;
    const server = http.createServer((_req, res) => {
      if (++count === 1) {
        received();
        return;
      }
      res.end(
        envelope(
          '<GetDeviceInformationResponse xmlns="http://www.onvif.org/ver10/device/wsdl"><Manufacturer>SIM</Manufacturer><Model>Next</Model><FirmwareVersion>1</FirmwareVersion><SerialNumber>TEST</SerialNumber><HardwareId>SIM</HardwareId></GetDeviceInformationResponse>',
        ),
      );
    });
    const p = await start(server);
    const conn = new CameraConnection(
      { ...camera, port: p },
      { username: "", password: "" },
      guard(),
      new Diagnostics(),
      "127.0.0.1",
    );
    try {
      const controller = new AbortController();
      const pending = conn.withReadSignal(controller.signal, () =>
        conn.call("getDeviceInformation"),
      );
      const rejected = expect(pending).rejects.toThrow("Lecture remplacée");
      await firstRequest;
      const at = Date.now();
      controller.abort(new Error("Lecture remplacée."));
      await rejected;
      expect(Date.now() - at).toBeLessThan(500);
      expect(conn.closed).toBe(false);
      expect((await conn.call("getDeviceInformation")).model).toBe("Next");
      expect(conn.pending.size).toBe(0);
    } finally {
      conn.destroy();
      await close(server);
    }
  });
  it("lit une identité simulée via la bibliothèque et lie les sockets à l’adresse source", async () => {
    const requests: string[] = [];
    const sources: string[] = [];
    const paths: string[] = [];
    const server = http.createServer((req, res) => {
      sources.push(req.socket.remoteAddress!);
      paths.push(req.url!);
      let body = "";
      req.on("data", (x) => (body += x));
      req.on("end", () => {
        requests.push(body);
        let reply = "";
        if (body.includes("<GetSystemDateAndTime"))
          reply =
            '<GetSystemDateAndTimeResponse xmlns="http://www.onvif.org/ver10/device/wsdl"><SystemDateAndTime><tt:UTCDateTime><tt:Time><tt:Hour>12</tt:Hour><tt:Minute>0</tt:Minute><tt:Second>0</tt:Second></tt:Time><tt:Date><tt:Year>2026</tt:Year><tt:Month>10</tt:Month><tt:Day>19</tt:Day></tt:Date></tt:UTCDateTime></SystemDateAndTime></GetSystemDateAndTimeResponse>';
        else if (body.includes("<GetServices"))
          reply =
            '<GetServicesResponse xmlns="http://www.onvif.org/ver10/device/wsdl"><Service><Namespace>http://www.onvif.org/ver10/device/wsdl</Namespace><XAddr>http://127.0.0.1/onvif/device_service</XAddr><Version><tt:Major>2</tt:Major><tt:Minor>0</tt:Minor></Version></Service><Service><Namespace>http://www.onvif.org/ver20/imaging/wsdl</Namespace><XAddr>http://127.0.0.1/onvif/imaging</XAddr><Version><tt:Major>2</tt:Major><tt:Minor>0</tt:Minor></Version></Service></GetServicesResponse>';
        else if (body.includes("<GetDeviceInformation"))
          reply =
            '<GetDeviceInformationResponse xmlns="http://www.onvif.org/ver10/device/wsdl"><Manufacturer>Simulateur de test</Manufacturer><Model>TEST-ONLY</Model><FirmwareVersion>1</FirmwareVersion><SerialNumber>SIM-A</SerialNumber><HardwareId>SIM</HardwareId></GetDeviceInformationResponse>';
        else if (body.includes("<GetNetworkInterfaces"))
          reply =
            '<GetNetworkInterfacesResponse xmlns="http://www.onvif.org/ver10/device/wsdl"><NetworkInterfaces token="eth1"><tt:Enabled>true</tt:Enabled><tt:Info><tt:HwAddress>aa:bb:cc:dd:ee:ff</tt:HwAddress></tt:Info><tt:IPv4><tt:Enabled>true</tt:Enabled><tt:Config><tt:Manual><tt:Address>127.0.0.1</tt:Address><tt:PrefixLength>24</tt:PrefixLength></tt:Manual><tt:DHCP>false</tt:DHCP></tt:Config></tt:IPv4></NetworkInterfaces></GetNetworkInterfacesResponse>';
        else
          reply =
            '<SetNetworkInterfacesResponse xmlns="http://www.onvif.org/ver10/device/wsdl"><RebootNeeded>false</RebootNeeded></SetNetworkInterfacesResponse>';
        res.writeHead(200, { "Content-Type": "application/soap+xml" });
        res.end(envelope(reply));
      });
    });
    const p = await start(server);
    const g = guard();
    const conn = new CameraConnection(
      { ...camera, port: p },
      { username: "test-only", password: "fixture-secret" },
      g,
      new Diagnostics(),
      "127.0.0.1",
    );
    try {
      await conn.connect();
      const info = await conn.identity();
      expect(info.model).toBe("TEST-ONLY");
      expect(info.mac).toBe("aa:bb:cc:dd:ee:ff");
      expect(sources.every((x) => x === "127.0.0.1")).toBe(true);
      expect(g.assert).toHaveBeenCalledWith("127.0.0.1");
      const nics = await conn.call("getNetworkInterfaces");
      expect(token(nics[0])).toBe("eth1");
      expect(nics[0].IPv4.config.DHCP).toBe(false);
      await conn.call("setNetworkInterfaces", {
        interfaceToken: "eth1",
        networkInterface: {
          enabled: true,
          IPv4: {
            enabled: true,
            manual: { address: "127.0.0.1", prefixLength: 24 },
            DHCP: false,
          },
        },
      });
      expect(
        requests.filter((x) => x.includes("<SetNetworkInterfaces")),
      ).toHaveLength(1);
      expect(requests.at(-1)).toContain(
        "<InterfaceToken>eth1</InterfaceToken>",
      );
      expect(requests.at(-1)).toContain("<DHCP>false</DHCP>");
      const writesBefore = conn.writeAttempts;
      await conn.setIPv4("eth1", true);
      expect(requests.at(-1)).toContain(
        '<sz:SetNetworkInterfaces xmlns:sz="http://www.onvif.org/ver10/device/wsdl">',
      );
      expect(requests.at(-1)).toContain("<tt:DHCP>true</tt:DHCP>");
      expect(requests.at(-1)).not.toContain("tt:Manual");
      expect(paths.at(-1)).toBe("/onvif/device_service");
      await conn.setIPv4("eth1", false, [
        { address: "127.0.0.2", prefixLength: 24 },
        { address: "127.0.0.3", prefixLength: 24 },
      ]);
      expect(requests.at(-1)?.match(/<tt:Manual>/g)).toHaveLength(2);
      expect(requests.at(-1)).toContain("<tt:DHCP>false</tt:DHCP>");
      expect(conn.writeAttempts).toBe(writesBefore + 2);
    } finally {
      conn.destroy();
      await close(server);
    }
  });
  it("ne contacte pas le serveur si le contexte réseau est révoqué", async () => {
    const handler = vi.fn((_: any, res: any) => res.end());
    const server = http.createServer(handler);
    const p = await start(server);
    const g = guard();
    g.ensureEpoch = () => {
      throw new Error("Réseau révoqué");
    };
    const conn = new CameraConnection(
      { ...camera, port: p },
      { username: "", password: "" },
      g,
      new Diagnostics(),
      "127.0.0.1",
    );
    try {
      await expect(conn.call("getDeviceInformation")).rejects.toThrow(
        "révoqué",
      );
      expect(handler).not.toHaveBeenCalled();
    } finally {
      conn.destroy();
      await close(server);
    }
  });
});
describe("Relais go2rtc officiel — exécution locale sans caméra", () => {
  it("envoie TEARDOWN avant de fermer le proxy et supporte des relances successives", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "quasar-switch-"));
    await mkdir(path.join(root, "bin"));
    await mkdir(path.join(root, "scripts"));
    await copyFile(
      path.resolve(
        "bin",
        process.platform === "win32" ? "go2rtc.exe" : "go2rtc",
      ),
      path.join(
        root,
        "bin",
        process.platform === "win32" ? "go2rtc.exe" : "go2rtc",
      ),
    );
    await copyFile(
      path.resolve("scripts/video-supervisor.cjs"),
      path.join(root, "scripts/video-supervisor.cjs"),
    );
    const methods: string[] = [];
    const rtsp = net.createServer((socket) => {
      let buffer = "";
      socket.on("data", (data) => {
        buffer += data.toString();
        let end: number;
        while ((end = buffer.indexOf("\r\n\r\n")) >= 0) {
          const request = buffer.slice(0, end);
          buffer = buffer.slice(end + 4);
          const method = request.split(" ")[0];
          methods.push(method);
          const sequence = request.match(/CSeq:\s*(\d+)/i)?.[1] ?? "1";
          let body = "",
            headers = "";
          if (method === "DESCRIBE") {
            body =
              "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=SIM\r\nc=IN IP4 127.0.0.1\r\nt=0 0\r\nm=video 0 RTP/AVP 96\r\na=rtpmap:96 H264/90000\r\na=fmtp:96 packetization-mode=1;profile-level-id=42C01F;sprop-parameter-sets=Z0LAH9oBQBbpUgAAAwACAAADAHkeMGVA,aM4G4g==\r\na=control:trackID=0\r\n";
            headers += "Content-Type: application/sdp\r\n";
          }
          if (method === "SETUP")
            headers +=
              "Session: simulator\r\nTransport: RTP/AVP/TCP;unicast;interleaved=0-1\r\n";
          socket.write(
            `RTSP/1.0 200 OK\r\nCSeq: ${sequence}\r\n${headers}Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
          );
        }
      });
      socket.on("error", () => {});
    });
    const p = await start(rtsp);
    const relay = new VideoRelay(root, guard(), new Diagnostics());
    try {
      for (let i = 0; i < 3; i++) {
        const stream = await relay.start(`rtsp://127.0.0.1:${p}/stream`);
        const viewer = new WebSocket(stream.url);
        viewer.on("error", () => {});
        await vi.waitFor(
          () => expect(methods.filter((m) => m === "PLAY")).toHaveLength(i + 1),
          { timeout: 4000 },
        );
        await relay.stop();
        viewer.terminate();
        expect(methods.filter((m) => m === "TEARDOWN")).toHaveLength(i + 1);
        expect(relay.sockets.size).toBe(0);
      }
    } finally {
      await relay.stop();
      await close(rtsp);
    }
  });
  it("ne démarre pas de relais après un arrêt pendant la préparation", async () => {
    let release!: (value: any) => void, entered!: () => void;
    const waiting = new Promise<any>((r) => (release = r)),
      reached = new Promise<void>((r) => (entered = r));
    const g = guard();
    g.assert = vi.fn(() => {
      entered();
      return waiting;
    });
    const relay = new VideoRelay("/unused", g, new Diagnostics());
    relay.available = async () => true;
    const pending = relay.start("rtsp://127.0.0.1/test");
    await reached;
    await relay.stop();
    release({ address: "127.0.0.1" });
    await expect(pending).rejects.toThrow("interrompu");
    expect(relay.child).toBeUndefined();
    expect(relay.proxy).toBeUndefined();
  });
  it("démarre en local, ne contacte pas le RTSP avant lecture, puis arrête son processus", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sezaam-relay-"));
    await mkdir(path.join(root, "bin"));
    await mkdir(path.join(root, "scripts"));
    await copyFile(
      path.resolve(
        "bin",
        process.platform === "win32" ? "go2rtc.exe" : "go2rtc",
      ),
      path.join(
        root,
        "bin",
        process.platform === "win32" ? "go2rtc.exe" : "go2rtc",
      ),
    );
    await copyFile(
      path.resolve("scripts/video-supervisor.cjs"),
      path.join(root, "scripts/video-supervisor.cjs"),
    );
    const handler = vi.fn((s: net.Socket) => s.destroy());
    const rtsp = net.createServer(handler);
    const p = await start(rtsp);
    const g = guard();
    const relay = new VideoRelay(root, g, new Diagnostics());
    try {
      const stream = await relay.start(
        `rtsp://test-only:fixture-secret@127.0.0.1:${p}/stream`,
      );
      expect(stream.url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/video\/[a-f0-9]+$/);
      expect(handler).not.toHaveBeenCalled();
      expect(relay.child?.exitCode).toBeNull();
      const config = await readFile(relay.config!, "utf8");
      expect(config).not.toContain("fixture-secret");
      const parsed = JSON.parse(config);
      expect(parsed.api.listen).toMatch(/^127\.0\.0\.1:/);
      expect(parsed.rtsp.listen).toBe("");
      expect(parsed.webrtc.listen).toBe("");
      expect(parsed.webrtc.ice_servers).toEqual([]);
      const viewer = new WebSocket(stream.url);
      const messages: string[] = [];
      viewer.on("message", (d) => messages.push(d.toString()));
      try {
        await new Promise<void>((resolve, reject) => {
          viewer.once("open", resolve);
          viewer.once("error", reject);
        });
        await vi.waitFor(
          () => expect(handler, messages.join(" ")).toHaveBeenCalled(),
          {
            timeout: 4000,
          },
        );
      } finally {
        viewer.terminate();
      }
      const child = relay.child!;
      await relay.stop();
      expect(child.exitCode).not.toBeNull();
      expect(relay.sockets.size).toBe(0);
      expect(relay.proxy).toBeUndefined();
      expect(relay.web).toBeUndefined();
    } finally {
      await relay.stop();
      await close(rtsp);
    }
  });
});

describe("Défaillances de bibliothèque et encodage des identifiants", () => {
  it("bloque une redirection RTSP même quand les en-têtes sont fragmentés", async () => {
    const stream = new RTSPResponseGuard();
    const chunks: Buffer[] = [];
    stream.on("data", (d) => chunks.push(d));
    const error = new Promise<Error>((resolve) =>
      stream.once("error", resolve),
    );
    stream.write("RTSP/1.0 30");
    stream.write("2 Moved\r\nLocation: rtsp://example.com/\r\n\r\n");
    expect((await error).message).toMatch(/redirection/);
    expect(chunks).toHaveLength(0);
  });
  it("laisse passer les réponses RTSP et les paquets vidéo entrelacés", () => {
    const stream = new RTSPResponseGuard();
    const chunks: Buffer[] = [];
    stream.on("data", (d) => chunks.push(d));
    const control = Buffer.from(
      "RTSP/1.0 200 OK\r\nContent-Length: 3\r\n\r\nabc",
    );
    const frame = Buffer.from([0x24, 0, 0, 3, 1, 2, 3]);
    stream.write(control.subarray(0, 10));
    stream.write(Buffer.concat([control.subarray(10), frame]));
    expect(Buffer.concat(chunks)).toEqual(Buffer.concat([control, frame]));
    stream.destroy();
  });
  it("convertit une exception asynchrone du setter en erreur bornée", async () => {
    const server = http.createServer((_, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("not SOAP");
    });
    const p = await start(server);
    const conn = new CameraConnection(
      { ...camera, port: p },
      { username: "", password: "" },
      guard(),
      new Diagnostics(),
      "127.0.0.1",
    );
    conn.cam.uri = { media: { path: "/onvif/media" } };
    try {
      await expect(
        conn.call("setVideoEncoderConfiguration", {
          token: "encoder-1",
          encoding: "H264",
        }),
      ).rejects.toBeDefined();
      expect(conn.closed).toBe(true);
    } finally {
      conn.destroy();
      await close(server);
    }
  });
  it("échappe le nom d’utilisateur SOAP sans altérer le secret en mémoire", () => {
    const conn = new CameraConnection(
      camera,
      { username: 'a<&"', password: "test-password" },
      guard(),
      new Diagnostics(),
      "127.0.0.1",
    );
    try {
      const xml = conn.cam._envelopeHeader();
      expect(xml).toContain("<Username>a&lt;&amp;&quot;</Username>");
      expect(conn.credentials.username).toBe('a<&"');
      expect(xml).not.toContain("test-password");
    } finally {
      conn.destroy();
    }
  });
});

it("envoie un unique reset ONVIF Hard au simulateur, sans confondre réponse et vérification d’usine", async () => {
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (x) => (body += x));
    req.on("end", () => {
      requests.push(body);
      res.end(
        envelope(
          '<SetSystemFactoryDefaultResponse xmlns="http://www.onvif.org/ver10/device/wsdl"/>',
        ),
      );
    });
  });
  const port = await start(server);
  const conn = new CameraConnection(
    { ...camera, port },
    { username: "", password: "" },
    guard(),
    new Diagnostics(),
    "127.0.0.1",
  );
  try {
    await conn.soap(
      "SetSystemFactoryDefault",
      "<sz:FactoryDefault>Hard</sz:FactoryDefault>",
      true,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain(
      "<sz:FactoryDefault>Hard</sz:FactoryDefault>",
    );
    expect(conn.writeAttempts).toBe(1);
  } finally {
    conn.destroy();
    await close(server);
  }
});
