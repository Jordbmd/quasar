import { describe, it, expect } from "vitest";
import { livePlayback } from "../src/shared/live-playback";
import { videoError } from "../src/shared/video-errors";
import {
  compareCameraIPs,
  preferredProfile,
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
  it("trie les IP numériquement et choisit le profil léger sans modifier l’encodeur", () => {
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
    expect(preferredProfile(profiles, "light").token).toBe("sub");
    expect(preferredProfile(profiles, "main").token).toBe("main");
    expect(profiles[0].token).toBe("main");
  });
});
