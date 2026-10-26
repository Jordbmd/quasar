import { execFileSync } from "node:child_process";
import { mkdir, writeFile, chmod, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
const version = "v1.9.14";
const asset = {
  darwin: { arm64: "go2rtc_mac_arm64.zip", x64: "go2rtc_mac_amd64.zip" },
  linux: { arm64: "go2rtc_linux_arm64", x64: "go2rtc_linux_amd64" },
}[process.platform]?.[process.arch];
if (!asset) throw new Error("Binaire go2rtc non prévu pour cette plateforme.");
const meta = await fetch(
  `https://api.github.com/repos/AlexxIT/go2rtc/releases/tags/${version}`,
);
if (!meta.ok) throw new Error("Métadonnées go2rtc indisponibles");
const release = await meta.json();
const item = release.assets.find((x) => x.name === asset);
if (!item) throw new Error("Binaire officiel absent");
const response = await fetch(item.browser_download_url);
if (!response.ok) throw new Error("Téléchargement go2rtc échoué");
const buffer = Buffer.from(await response.arrayBuffer());
const hash = createHash("sha256").update(buffer).digest("hex");
if (item.digest && item.digest !== `sha256:${hash}`)
  throw new Error("Empreinte go2rtc incorrecte");
await mkdir("bin", { recursive: true });
if (asset.endsWith(".zip")) {
  await writeFile("bin/download.zip", buffer);
  execFileSync("/usr/bin/unzip", ["-o", "bin/download.zip", "-d", "bin"]);
  await unlink("bin/download.zip");
} else await writeFile("bin/go2rtc", buffer, { mode: 0o755 });
await chmod("bin/go2rtc", 0o755);
await writeFile(
  "bin/go2rtc-version.json",
  JSON.stringify(
    {
      version,
      asset,
      url: item.browser_download_url,
      sha256: hash,
      upstreamDigest: item.digest ?? null,
    },
    null,
    2,
  ),
);
console.log(
  `go2rtc ${version} ${process.platform}/${process.arch} installé localement. SHA-256 : ${hash}`,
);
