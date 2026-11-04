import { createHash } from "node:crypto";
export const version = "v1.9.15";
// SHA-256 values published by GitHub for this exact upstream release, checked 2026-11-03.
// https://github.com/AlexxIT/go2rtc/releases/tag/v1.9.15
export const assets = {
  "darwin-arm64": [
    "go2rtc_mac_arm64.zip",
    "d0cf858a71803dce2377423bc830639137ee96c335f88e9912e7f7898374266d",
  ],
  "darwin-x64": [
    "go2rtc_mac_amd64.zip",
    "7ca6075421b824eebe0383d20bd42a6f6a7ec7591a60931d42290f1d375169b9",
  ],
  "linux-x64": [
    "go2rtc_linux_amd64",
    "20b46c6910734cb05ecefb234066f36868ff19b42ba1418a7a32e13a3e035712",
  ],
  "linux-arm64": [
    "go2rtc_linux_arm64",
    "af416f22b21a24ab83b8d78642190b4932ae695b4e386853f11d1b0319781763",
  ],
  "win32-x64": [
    "go2rtc_win64.zip",
    "5b448fc90f15c925406d8da0984301985e385050222c1c2bbdf0a76fe4b1e9cb",
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
