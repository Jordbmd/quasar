import { describe, it, expect, vi } from "vitest";
import { livePlayback } from "../src/shared/live-playback";
import { videoError } from "../src/shared/video-errors";
import {
  compareCameraIPs,
  preferredProfile,
  readPreferences,
} from "../src/renderer/preferences";
describe("Lecture et navigation", () => {
  it("distingue un délai RTSP d’un refus d’authentification sans exposer l’URI", () => {
    expect(videoError("mse: streams: read tcp: i/o timeout")).toContain(
      "pas répondu à temps",
    );
    expect(videoError("wrong user/pass")).toContain("refusé les identifiants");
    expect(
      videoError("rtsp://admin:secret@192.0.2.1/foo failed"),
    ).not.toContain("secret");
  });
  it("rattrape le retard sans sortir de la plage disponible", () => {
    expect(livePlayback(10, 9, 13, true)).toEqual({ seek: 12.75, rate: 1 });
    expect(livePlayback(0, 20, 20.1, true).seek).toBe(20);
    expect(livePlayback(12.8, 9, 13, true)).toEqual({
      seek: undefined,
      rate: 1,
    });
    expect(livePlayback(12.3, 9, 13, true).rate).toBe(1.05);
    expect(livePlayback(11, 9, 13, false)).toEqual({
      seek: undefined,
      rate: 1,
    });
  });
  it("trie les IP numériquement et choisit le flux principal sans modifier l’encodeur", () => {
    expect(
      ["192.168.1.100", "192.168.1.9", "192.168.1.15"].sort(compareCameraIPs),
    ).toEqual(["192.168.1.9", "192.168.1.15", "192.168.1.100"]);
    const profiles = [
      {
        token: "main",
        videoEncoderConfiguration: {
          resolution: { width: 2304, height: 1296 },
        },
      },
      {
        token: "sub",
        videoEncoderConfiguration: { resolution: { width: 640, height: 360 } },
      },
    ];
    expect(preferredProfile(profiles).token).toBe("main");
    expect(profiles[0].token).toBe("main");
  });
});

it("choisit MainStream même lorsqu’il n’est pas le premier profil", () => {
  const profiles = [
    {
      token: "sub",
      name: "SubStream",
      videoEncoderConfiguration: { resolution: { width: 3840, height: 2160 } },
    },
    {
      token: "p2",
      name: "MainStream",
      videoEncoderConfiguration: { resolution: { width: 1920, height: 1080 } },
    },
  ];
  expect(preferredProfile(profiles)).toBe(profiles[1]);
  expect(profiles[0].token).toBe("sub");
});

it("utilise la plus grande résolution si aucun flux principal n’est nommé", () => {
  const profiles = [
    { token: "a" },
    {
      token: "b",
      videoEncoderConfiguration: { resolution: { width: 640, height: 360 } },
    },
    {
      token: "c",
      videoEncoderConfiguration: { resolution: { width: 1920, height: 1080 } },
    },
  ];
  expect(preferredProfile(profiles)).toBe(profiles[2]);
  expect(preferredProfile([])).toBeUndefined();
});

it("remplace l’ancien défaut léger sans changer les autres préférences", () => {
  vi.stubGlobal("localStorage", {
    getItem: () =>
      JSON.stringify({
        previewQuality: "light",
        autoplay: false,
        lowLatency: false,
      }),
  });
  try {
    expect(readPreferences()).toEqual({
      previewQuality: "main",
      autoplay: false,
      lowLatency: false,
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
