import { mkdir, writeFile, chmod, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { unzipSync } from "fflate";
import { version, videoAsset, verifyAsset } from "./video-assets.mjs";
const platform = process.env.QUASAR_TARGET_PLATFORM || process.platform;
const arch = process.env.QUASAR_TARGET_ARCH || process.arch;
const asset = videoAsset(platform, arch);
const url = `https://github.com/AlexxIT/go2rtc/releases/download/${version}/${asset.name}`;
const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
if (!response.ok)
  throw Error(`Téléchargement go2rtc échoué (HTTP ${response.status}).`);
const buffer = Buffer.from(await response.arrayBuffer());
const sha256 = verifyAsset(buffer, asset.sha256);
// Extract exactly one known executable in memory. Never materialize archive paths or symlinks.
const binary = asset.name.endsWith(".zip")
  ? unzipSync(buffer, { filter: (entry) => entry.name === asset.executable })[
      asset.executable
    ]
  : buffer;
if (!binary?.length) throw Error("Exécutable absent de l’archive officielle.");
await mkdir("bin", { recursive: true });
const file = path.resolve("bin", asset.executable),
  temporary = file + "." + randomUUID();
try {
  await writeFile(temporary, binary, { flag: "wx", mode: 0o755 });
  if (platform !== "win32") await chmod(temporary, 0o755);
  await rename(temporary, file);
} finally {
  await unlink(temporary).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}
await writeFile(
  "bin/go2rtc-version.json",
  JSON.stringify(
    {
      version,
      platform,
      arch,
      asset: asset.name,
      url,
      sha256,
      verifiedAgainst: "Pinned upstream GitHub release digest",
    },
    null,
    2,
  ),
);
console.log(
  `go2rtc ${version} ${platform}/${arch} installé, empreinte officielle vérifiée.`,
);
