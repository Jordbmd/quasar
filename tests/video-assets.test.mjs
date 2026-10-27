import { it, expect } from "vitest";
import { createHash } from "node:crypto";
import { videoAsset, verifyAsset } from "../scripts/video-assets.mjs";
it("résout chaque cible et refuse une empreinte absente ou différente", () => {
  expect(videoAsset("win32", "x64").executable).toBe("go2rtc.exe");
  expect(videoAsset("linux", "x64").name).toBe("go2rtc_linux_amd64");
  expect(videoAsset("darwin", "arm64").name).toBe("go2rtc_mac_arm64.zip");
  expect(() => videoAsset("win32", "arm64")).toThrow();
  const b = Buffer.from("fixture"),
    hash = createHash("sha256").update(b).digest("hex");
  expect(verifyAsset(b, hash)).toBe(hash);
  expect(() => verifyAsset(b, "")).toThrow();
  expect(() => verifyAsset(b, "0".repeat(64))).toThrow();
});
