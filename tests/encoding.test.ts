import { describe, it, expect } from "vitest";
import { encoderPayload, encoderFingerprint } from "../src/main/encoding";
import { videoCapabilities } from "../src/shared/video-options";
import { validateVideo, CameraConnection } from "../src/main/onvif";
import { Diagnostics } from "../src/main/diagnostics";
import http from "node:http";
const ns = "http://www.onvif.org/ver10/media/wsdl";
const xml = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tt="http://www.onvif.org/ver10/schema" xmlns:v="urn:vendor"><s:Header><MessageID>one</MessageID></s:Header><s:Body><GetVideoEncoderConfigurationResponse xmlns="${ns}"><Configuration token="enc"><tt:Name>Source &amp; test</tt:Name><tt:Encoding>H264</tt:Encoding><tt:Resolution><tt:Width>1920</tt:Width><tt:Height>1080</tt:Height></tt:Resolution><tt:Quality>0</tt:Quality><tt:RateControl ConstantBitRate="true"><tt:FrameRateLimit>25</tt:FrameRateLimit><tt:EncodingInterval>1</tt:EncodingInterval><tt:BitrateLimit>4096</tt:BitrateLimit></tt:RateControl><tt:H264><tt:GovLength>50</tt:GovLength><tt:H264Profile>Main</tt:H264Profile></tt:H264><tt:Multicast><tt:AutoStart>false</tt:AutoStart></tt:Multicast><tt:Extension><v:Keep enabled="false">Do not drop</v:Keep></tt:Extension></Configuration></GetVideoEncoderConfigurationResponse></s:Body></s:Envelope>`;
const input = { id: "test", token: "enc", width: 1280, height: 720, fps: 20 };
describe("Écriture vidéo avec préservation du XML", () => {
  it("change uniquement les valeurs demandées et conserve tous les autres champs", () => {
    const result = encoderPayload(xml, "enc", ns, input, {
      config: { encoding: "H264" },
    });
    expect(result).toContain("<tt:Width>1280</tt:Width>");
    expect(result).toContain("<tt:FrameRateLimit>20</tt:FrameRateLimit>");
    expect(result).toContain('ConstantBitRate="true"');
    expect(result).toContain("<tt:Quality>0</tt:Quality>");
    expect(result).toContain('<v:Keep enabled="false">Do not drop</v:Keep>');
    expect(result).toContain('xmlns:v="urn:vendor"');
    expect(result).toContain("<tt:EncodingInterval>1</tt:EncodingInterval>");
  });
  it("compare la configuration et non les identifiants de réponse SOAP", () => {
    expect(encoderFingerprint(xml, "enc")).toBe(
      encoderFingerprint(
        xml.replace("<MessageID>one", "<MessageID>two"),
        "enc",
      ),
    );
    expect(encoderFingerprint(xml, "enc")).not.toBe(
      encoderFingerprint(xml.replace(">4096<", ">2048<"), "enc"),
    );
  });
  it("refuse un token absent et un nouveau codec sans options vérifiées", () => {
    expect(() =>
      encoderPayload(xml, "wrong", ns, input, { config: { encoding: "H264" } }),
    ).toThrow("absente");
    expect(() =>
      encoderPayload(
        xml,
        "enc",
        ns,
        { ...input, codec: "MPEG4" },
        { config: { encoding: "H264" }, options: { data: {} } },
      ),
    ).toThrow("Options");
  });
  it("retire les paramètres spécifiques à l’ancien codec lors du passage à JPEG", () => {
    const result = encoderPayload(
      xml,
      "enc",
      ns,
      { ...input, codec: "JPEG" },
      { config: { encoding: "H264" }, options: { data: { JPEG: {} } } },
    );
    expect(result).toContain("<tt:Encoding>JPEG</tt:Encoding>");
    expect(result).not.toContain("tt:H264");
    expect(result).toContain("v:Keep");
  });
  it("lit les attributs Media2 et refuse les FPS absents de la liste annoncée", () => {
    const e = {
      config: { encoding: "H265" },
      options: {
        state: "available",
        data: {
          encoding: "H265",
          $: {
            FrameRatesSupported: "30 15 7.5",
            GovLengthRange: "1 120",
            ConstantBitRateSupported: true,
          },
          resolutionsAvailable: { width: 1280, height: 720 },
          qualityRange: { min: 0, max: 6 },
          bitrateRange: { min: 64, max: 8192 },
        },
      },
    };
    expect(videoCapabilities(e)).toMatchObject({
      codecs: ["H265"],
      fpsValues: [30, 15, 7.5],
      gov: { min: 1, max: 120 },
      constantBitrate: true,
    });
    expect(() => validateVideo(e, { ...input, fps: 7.5 })).not.toThrow();
    expect(() => validateVideo(e, { ...input, fps: 20 })).toThrow(
      "FPS non proposés",
    );
  });
  it("choisit un profil réellement annoncé lors du changement de codec Media2", () => {
    const original = xml.replace(
      'token="enc"',
      'token="enc" Profile="High" GovLength="50"',
    );
    const e = {
      config: { encoding: "H264" },
      options: {
        data: [
          {
            encoding: "H265",
            $: { ProfilesSupported: "Main Main10", GovLengthRange: "1 120" },
          },
        ],
      },
    };
    const result = encoderPayload(
      original,
      "enc",
      "http://www.onvif.org/ver20/media/wsdl",
      { ...input, codec: "H265" },
      e,
    );
    expect(result).toContain('Profile="Main"');
    expect(result).toContain('GovLength="50"');
    expect(result).not.toContain("tt:H264");
  });
  it("envoie la configuration conservée au service média et reçoit le SOAP complet", async () => {
    const requests: { body: string; url: string; action: string }[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        requests.push({
          body,
          url: req.url!,
          action: String(req.headers["content-type"]),
        });
        res.setHeader("Content-Type", "application/soap+xml");
        res.end(
          body.includes("<sz:GetVideoEncoderConfiguration")
            ? xml
            : `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SetVideoEncoderConfigurationResponse xmlns="${ns}"/></s:Body></s:Envelope>`,
        );
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const conn = new CameraConnection(
      {
        id: "test",
        ip: "127.0.0.1",
        port: (server.address() as any).port,
        path: "/device",
        ambiguous: false,
        status: "TEST",
      },
      { username: "", password: "" },
      {
        epoch: 1,
        assert: async () => ({ address: "127.0.0.1" }),
        ensureEpoch: () => {},
      } as any,
      new Diagnostics(),
      "127.0.0.1",
    );
    conn.cam.uri = { media: { path: "/real-media-path" } };
    try {
      const original = await conn.encoderXML("enc");
      expect(original).toContain('xmlns:v="urn:vendor"');
      const payload = encoderPayload(original, "enc", ns, input, {
        config: { encoding: "H264" },
      });
      await conn.soap(
        "SetVideoEncoderConfiguration",
        payload + "<sz:ForcePersistence>true</sz:ForcePersistence>",
      );
      expect(requests.at(-1)?.url).toBe("/real-media-path");
      expect(requests.at(-1)?.action).toContain(
        ns + "/SetVideoEncoderConfiguration",
      );
      expect(requests.at(-1)?.body).toContain("v:Keep");
      expect(conn.writeAttempts).toBe(1);
    } finally {
      conn.destroy();
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});

describe("Profil H.264 du profil Sezaam", () => {
  const entry = {
    config: { encoding: "H264" },
    options: {
      state: "available",
      data: {
        H264: {
          H264ProfilesSupported: ["Main", "High"],
          resolutionsAvailable: [{ width: 1280, height: 720 }],
          frameRateRange: { min: 1, max: 30 },
        },
      },
    },
  };
  it("écrit High en Media1 sans perdre l’extension constructeur", () => {
    const v = { ...input, h264Profile: "High" };
    expect(() => validateVideo(entry, v)).not.toThrow();
    const result = encoderPayload(xml, "enc", ns, v, entry);
    expect(result).toContain("<tt:H264Profile>High</tt:H264Profile>");
    expect(result).toContain('<v:Keep enabled="false">Do not drop</v:Keep>');
    expect(() =>
      validateVideo(entry, { ...v, h264Profile: "Baseline" }),
    ).toThrow("non annoncé");
  });
  it("écrit l’attribut Profile Media2 et rejette un profil H.264 sur H.265", () => {
    const e = {
      config: { encoding: "H264" },
      options: {
        state: "available",
        data: {
          encoding: "H264",
          $: { ProfilesSupported: "Main High", FrameRatesSupported: "20" },
          resolutionsAvailable: [{ width: 1280, height: 720 }],
        },
      },
    };
    const original = xml.replace(
      'token="enc"',
      'token="enc" Profile="Main" GovLength="50"',
    );
    expect(
      encoderPayload(
        original,
        "enc",
        "http://www.onvif.org/ver20/media/wsdl",
        { ...input, h264Profile: "High" },
        e,
      ),
    ).toContain('Profile="High"');
    expect(() =>
      validateVideo(e, { ...input, codec: "H265", h264Profile: "High" }),
    ).toThrow("non annoncé");
  });
});

it("respecte les limites supplémentaires propres à une résolution", () => {
  const e = {
    config: { encoding: "H264" },
    options: {
      state: "available",
      data: {
        H264: {
          frameRateRange: { min: 1, max: 30 },
          bitrateRange: { min: 128, max: 8192 },
          resolutionsAvailable: [
            {
              width: 2304,
              height: 1296,
              frameRateRange: { min: 5, max: 25 },
              bitrateRange: { min: 512, max: 5120 },
            },
          ],
        },
      },
    },
  };
  expect(() =>
    validateVideo(e, { width: 2304, height: 1296, fps: 30, bitrate: 5120 }),
  ).toThrow("FPS pour cette résolution");
  expect(() =>
    validateVideo(e, { width: 2304, height: 1296, fps: 25, bitrate: 8192 }),
  ).toThrow("Débit pour cette résolution");
  expect(() =>
    validateVideo(e, { width: 2304, height: 1296, fps: 25, bitrate: 5120 }),
  ).not.toThrow();
});

it("lit les limites de résolution dans les extensions Media1 sans ajouter de résolution non annoncée", () => {
  const e = {
    config: { encoding: "H264" },
    options: {
      state: "available",
      data: {
        H264: {
          frameRateRange: { min: 1, max: 30 },
          resolutionsAvailable: [{ width: 2304, height: 1296 }],
        },
        extension: {
          H264: {
            bitrateRange: { min: 320, max: 5120 },
            resolutionsAvailable: [
              {
                width: 2304,
                height: 1296,
                frameRateRange: { min: 5, max: 25 },
                bitrateRange: { min: 512, max: 5120 },
              },
              { width: 320, height: 240 },
            ],
          },
        },
      },
    },
  };
  expect(videoCapabilities(e).resolutions).toHaveLength(1);
  expect(() =>
    validateVideo(e, { width: 2304, height: 1296, fps: 30, bitrate: 5120 }),
  ).toThrow("FPS pour cette résolution");
  expect(() =>
    validateVideo(e, { width: 2304, height: 1296, fps: 25, bitrate: 320 }),
  ).toThrow("Débit pour cette résolution");
});
