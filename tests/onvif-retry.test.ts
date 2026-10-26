// Transport is mocked: these tests never contact a physical camera.
import { expect, it, vi } from "vitest";
import { CameraConnection } from "../src/main/onvif";
import { Diagnostics } from "../src/main/diagnostics";
function fixture() {
  const log = new Diagnostics();
  const conn = new CameraConnection(
    {
      id: "fixture",
      ip: "127.0.0.1",
      port: 80,
      path: "/onvif/device_service",
      status: "",
      ambiguous: false,
    },
    { username: "fixture", password: "test-only" },
    { epoch: 1, assert: vi.fn(async () => {}), ensureEpoch: vi.fn() } as any,
    log,
    "127.0.0.1",
  );
  return { conn, log };
}
it("récupère une lecture interrompue, avec trois tentatives maximum", async () => {
  const { conn, log } = fixture();
  let attempts = 0;
  conn.cam.getDeviceInformation = vi.fn((callback: any) =>
    callback(++attempts < 3 ? new Error("Network timeout") : null, {
      model: "SIM",
    }),
  );
  try {
    expect(await conn.call("getDeviceInformation")).toEqual({ model: "SIM" });
    expect(attempts).toBe(3);
    expect(conn.pending.size).toBe(0);
    expect(log.entries).toHaveLength(2);
    attempts = 0;
    conn.cam.getDeviceInformation = vi.fn((callback: any) => {
      attempts++;
      callback(new Error("ECONNRESET"));
    });
    await expect(conn.call("getDeviceInformation")).rejects.toThrow(
      "ECONNRESET",
    );
    expect(attempts).toBe(3);
  } finally {
    conn.destroy();
  }
});
it("ne répète ni un refus d’authentification ni une écriture interrompue", async () => {
  const { conn, log } = fixture();
  conn.cam.getDeviceInformation = vi.fn((callback: any) =>
    callback(new Error("Digest authentication failed 401")),
  );
  conn.cam.setDNS = vi.fn((_: any, callback: any) =>
    callback(new Error("Network timeout")),
  );
  try {
    await expect(conn.call("getDeviceInformation")).rejects.toThrow("401");
    await expect(conn.call("setDNS", {})).rejects.toThrow("Network timeout");
    expect(conn.cam.getDeviceInformation).toHaveBeenCalledTimes(1);
    expect(conn.cam.setDNS).toHaveBeenCalledTimes(1);
    expect(log.entries).toHaveLength(0);
  } finally {
    conn.destroy();
  }
});
it("reprend les lectures SOAP OSD, sans répéter leurs écritures", async () => {
  const { conn } = fixture();
  let attempts = 0;
  conn.cam._request = vi.fn((_: any, callback: any) => {
    if (++attempts < 3) return callback(new Error("Network timeout"));
    conn.cam.emit("rawResponse", "<GetOSDsResponse/>");
    callback(null);
  });
  try {
    expect(await conn.soap("GetOSDs")).toBe("<GetOSDsResponse/>");
    expect(attempts).toBe(3);
    expect(conn.cam.listenerCount("rawResponse")).toBe(0);
    conn.cam._request = vi.fn((_: any, callback: any) =>
      callback(new Error("Network timeout")),
    );
    await expect(conn.soap("SetOSD")).rejects.toThrow("Network timeout");
    expect(conn.cam._request).toHaveBeenCalledTimes(1);
  } finally {
    conn.destroy();
  }
});
it("relit l’horloge par l’échange device standard en conservant la preuve XML", async () => {
  const { conn } = fixture();
  const xml =
    "<GetSystemDateAndTimeResponse><SystemDateAndTime/></GetSystemDateAndTimeResponse>";
  conn.cam.getSystemDateAndTime = vi.fn((callback: any) =>
    callback(null, new Date(), xml),
  );
  try {
    expect(await conn.soap("GetSystemDateAndTime", "", true)).toBe(xml);
    expect(conn.cam.getSystemDateAndTime).toHaveBeenCalledTimes(1);
    conn.cam.getSystemDateAndTime = vi.fn((callback: any) =>
      callback(null, new Date()),
    );
    await expect(conn.soap("GetSystemDateAndTime", "", true)).rejects.toThrow(
      "complète absente",
    );
  } finally {
    conn.destroy();
  }
});
it("relit la MAC par l’API web après une lecture ONVIF manquante, sans accepter une autre IP", async () => {
  const { conn } = fixture();
  conn.cam.getDeviceInformation = vi.fn((callback: any) =>
    callback(null, { serialNumber: "SIM-1" }),
  );
  conn.cam.getNetworkInterfaces = vi.fn((callback: any) => callback(null, []));
  let ip = "127.0.0.1";
  conn.vendorRequest = vi.fn(
    async () =>
      `<NetworkConfig><LANConfig IPAddress="${ip}" MacAddress="12:34:56:78:9A:BC"/></NetworkConfig>`,
  );
  try {
    expect(await conn.identity()).toMatchObject({
      serial: "SIM-1",
      mac: "12:34:56:78:9a:bc",
    });
    ip = "192.0.2.100";
    expect((await conn.identity()).mac).toBeUndefined();
  } finally {
    conn.destroy();
  }
});
it("arrête une reprise lorsque la connexion est fermée", async () => {
  const { conn } = fixture();
  conn.cam.getDeviceInformation = vi.fn((callback: any) => {
    callback(new Error("Network timeout"));
    setTimeout(() => conn.destroy(), 20);
  });
  await expect(conn.call("getDeviceInformation")).rejects.toThrow("fermée");
  expect(conn.cam.getDeviceInformation).toHaveBeenCalledTimes(1);
});
it("explique un délai réseau sans le présenter comme un refus de mot de passe", () => {
  expect(new Diagnostics().safe(new Error("Network timeout"))).toContain(
    "la caméra n’a pas répondu à temps",
  );
});

it("regroupe les lectures indépendantes sans dépasser trois requêtes", async () => {
  let active = 0,
    maximum = 0;
  const fake = {
    cam: { profiles: [], activeSource: { sourceToken: "source" } },
    log: new Diagnostics(),
    feature: CameraConnection.prototype.feature,
    readSignal: { getStore: () => undefined },
    vendorRequest: async () => {
      throw Error("ActionNotSupported");
    },
    call: async (method: string) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return method === "getProfiles" || method === "getNetworkInterfaces"
        ? []
        : {};
    },
    osds: async () => [],
  };
  const detail = await CameraConnection.prototype.detail.call(fake as any);
  expect(maximum).toBe(3);
  expect(detail.network.state).toBe("available");
  expect(detail.video.state).toBe("available");
  expect(detail.osd.state).toBe("available");
});

it("publie les blocs prêts avant un OSD lent et reprend seulement les blocs manquants", async () => {
  const { conn } = fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: string[] = [];
  conn.cam.profiles = [];
  conn.call = vi.fn(async (method: string) => {
    calls.push(method);
    return method === "getProfiles" || method === "getNetworkInterfaces"
      ? []
      : {};
  });
  conn.osds = vi.fn(async () => {
    await gate;
    return [];
  });
  const updates: any[] = [];
  const controller = new AbortController();
  const first = conn.withReadSignal(controller.signal, () =>
    conn.detail((d) => updates.push(d)),
  );
  const rejected = expect(first).rejects.toThrow("Lecture remplacée");
  try {
    await vi.waitFor(() => expect(updates.at(-1)?.dns.state).toBe("available"));
    const partial = updates.at(-1);
    expect(partial.osd.state).toBe("loading");
    expect(partial.loading).toBe(true);
    expect(partial.video.state).toBe("available");
    controller.abort(new Error("Lecture remplacée"));
    await rejected;
    const count = updates.length;
    release();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(updates).toHaveLength(count);
    calls.length = 0;
    const resumed = await conn.detail(undefined, partial);
    expect(resumed.osd.state).toBe("available");
    expect(resumed.loading).toBe(false);
    expect(calls).not.toContain("getNetworkInterfaces");
    expect(calls).not.toContain("getDNS");
    expect(calls).not.toContain("getProfiles");
  } finally {
    release();
    conn.destroy();
  }
});

it("attend les profils manquants pour lire les options OSD, avec une seule requête de profils", async () => {
  const { conn } = fixture();
  conn.cam.profiles = [];
  conn.call = vi.fn(async (method: string) =>
    method === "getProfiles"
      ? [
          {
            $: { token: "main" },
            videoSourceConfiguration: { $: { token: "source" } },
          },
        ]
      : method === "getNetworkInterfaces"
        ? []
        : {},
  );
  conn.osds = vi.fn(async () => []);
  conn.osdOptions = vi.fn(async () => ({ types: ["Text"] })) as any;
  try {
    const detail = await conn.detail();
    expect(conn.osdOptions).toHaveBeenCalledWith("source");
    expect(detail.osd.data.options[0].result.state).toBe("available");
    expect(
      vi.mocked(conn.call).mock.calls.filter((c) => c[0] === "getProfiles"),
    ).toHaveLength(1);
  } finally {
    conn.destroy();
  }
});

it("retrouve une source d’image unique depuis les profils après une connexion partielle", async () => {
  const { conn } = fixture();
  conn.cam.profiles = [];
  conn.cam.activeSource = undefined;
  conn.call = vi.fn(async (method: string) =>
    method === "getProfiles"
      ? [
          {
            videoSourceConfiguration: {
              sourceToken: "sensor-1",
              $: { token: "config-1" },
            },
          },
        ]
      : method === "getNetworkInterfaces"
        ? []
        : {},
  );
  conn.osds = vi.fn(async () => []);
  conn.osdOptions = vi.fn(async () => ({})) as any;
  try {
    const d = await conn.detail();
    expect(d.image.state).toBe("available");
    expect(d.image.data.sourceToken).toBe("sensor-1");
    expect(conn.call).toHaveBeenCalledWith("getImagingSettings", {
      token: "sensor-1",
    });
  } finally {
    conn.destroy();
  }
});
it("ne choisit pas arbitrairement un capteur lorsque plusieurs sources sont annoncées", async () => {
  const { conn } = fixture();
  conn.cam.profiles = [];
  conn.cam.activeSource = undefined;
  conn.call = vi.fn(async (method: string) =>
    method === "getProfiles"
      ? ["a", "b"].map((sourceToken) => ({
          videoSourceConfiguration: { sourceToken },
        }))
      : method === "getNetworkInterfaces"
        ? []
        : {},
  );
  conn.osds = vi.fn(async () => []);
  try {
    const d = await conn.detail();
    expect(d.image.state).not.toBe("available");
    expect(d.image.message).toContain("ambiguë");
    expect(
      vi
        .mocked(conn.call)
        .mock.calls.some((c) => c[0] === "getImagingSettings"),
    ).toBe(false);
  } finally {
    conn.destroy();
  }
});

it("sérialise les lectures et ne lance pas une lecture annulée dans la file", async () => {
  const { conn } = fixture();
  const calls: string[] = [];
  let release!: () => void;
  conn.cam.getDeviceInformation = (cb: any) => {
    calls.push("identity");
    release = () => cb(null, { model: "SIM" });
  };
  conn.cam.getDNS = (cb: any) => {
    calls.push("dns");
    cb(null, {});
  };
  const first = conn.call("getDeviceInformation");
  await new Promise((r) => setTimeout(r, 0));
  const controller = new AbortController();
  const second = conn.withReadSignal(controller.signal, () =>
    conn.call("getDNS"),
  );
  controller.abort(Error("cancelled"));
  await expect(second).rejects.toThrow("cancelled");
  expect(calls).toEqual(["identity"]);
  release();
  await first;
  await new Promise((r) => setTimeout(r, 0));
  expect(calls).toEqual(["identity"]);
  conn.destroy();
});
it("ne bascule pas Media2 vers Media1 après un timeout de profils", async () => {
  const { conn } = fixture();
  conn.cam.getSystemDateAndTime = (cb: any) => cb(null, new Date());
  conn.cam.getServices = (_: any, cb: any) => {
    conn.cam.media2Support = true;
    conn.cam.uri = { media: {}, media2: {} };
    cb(null, {});
  };
  conn.cam.getProfiles = vi.fn((cb: any) => cb(Error("Network timeout")));
  conn.cam.getVideoSources = (cb: any) => cb(null, []);
  conn.identity = vi.fn(async () => conn.camera);
  await expect(conn.connect()).resolves.toBeUndefined();
  expect(conn.cam.media2Support).toBe(true);
  expect(conn.cam.getProfiles).toHaveBeenCalledTimes(3);
  conn.destroy();
});
