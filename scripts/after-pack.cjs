const path = require("node:path");
const { access, readFile, writeFile } = require("node:fs/promises");
module.exports = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const resourceRoot =
    platform === "darwin"
      ? path.join(context.appOutDir, "Quasar.app", "Contents", "Resources")
      : path.join(context.appOutDir, "resources");
  await access(
    path.join(
      resourceRoot,
      "bin",
      platform === "win32" ? "go2rtc.exe" : "go2rtc",
    ),
  );
  await access(path.join(resourceRoot, "scripts", "video-supervisor.cjs"));
  const meta = JSON.parse(
    await readFile(
      path.join(resourceRoot, "bin", "go2rtc-version.json"),
      "utf8",
    ),
  );
  const arch = require("electron-builder").Arch[context.arch];
  if (meta.platform !== platform || meta.arch !== arch || !meta.verifiedAgainst)
    throw Error(
      "Le relais embarqué ne correspond pas à la plateforme/architecture cible. Relancer setup:video pour cette cible.",
    );
  if (platform === "darwin") {
    const { assignAppUUID } = await import("./macho-identity.mjs");
    const executable = path.join(
      context.appOutDir,
      "Quasar.app",
      "Contents",
      "MacOS",
      "Quasar",
    );
    const binary = await readFile(executable);
    assignAppUUID(binary, "fr.sezaam.camera-tool");
    await writeFile(executable, binary);
  }
};
