import { createHash } from "node:crypto";
export const version = "v1.9.14";
// SHA-256 values published by GitHub for this exact upstream release, checked 2026-10-26.
// https://github.com/AlexxIT/go2rtc/releases/tag/v1.9.14
export const assets = {
  "darwin-arm64": [
    "go2rtc_mac_arm64.zip",
    "919b78adc759d6b3883d1e1b2ac915ac0985bb903ff1897b4d228527bd64690c",
  ],
  "darwin-x64": [
    "go2rtc_mac_amd64.zip",
    "9b0b9a27a4dc3a5b8b93376e7e8fc2787c6af624a512842622be84aec0171c7a",
  ],
  "linux-x64": [
    "go2rtc_linux_amd64",
    "32d616af226bd731678ffde328b94cfb94e30339bfefc469cfb76323144615a6",
  ],
  "linux-arm64": [
    "go2rtc_linux_arm64",
    "359fabade8a7a51e81a55fe6df6b0ef81764a5e1d63179577534eaaa71904b50",
  ],
  "win32-x64": [
    "go2rtc_win64.zip",
    "dd4167d75cb04abe618855b7c71f8658bd009f60c1a71835d134d2c11c939907",
  ],
};
export function videoAsset(platform, arch) {
  const entry = assets[`${platform}-${arch}`];
  if (!entry) throw Error(`Relais non prévu pour ${platform}/${arch}.`);
  return {
    name: entry[0],
    sha256: entry[1],
    executable: platform === "win32" ? "go2rtc.exe" : "go2rtc",
  };
}
export function verifyAsset(buffer, expected) {
  const actual = createHash("sha256").update(buffer).digest("hex");
  if (!/^[a-f0-9]{64}$/.test(expected) || actual !== expected)
    throw Error("Empreinte officielle go2rtc incorrecte.");
  return actual;
}
