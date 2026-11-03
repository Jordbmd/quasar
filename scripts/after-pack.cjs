const path = require("node:path");
const { createHash } = require("node:crypto");
const { access, readFile, writeFile, mkdir } = require("node:fs/promises");
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
  const relay = await readFile(
    path.join(
      resourceRoot,
      "bin",
      platform === "win32" ? "go2rtc.exe" : "go2rtc",
    ),
  );
  if (
    meta.platform !== platform ||
    meta.arch !== arch ||
    meta.sourceCommit !== "7c05066c90ab6ad1fccb506d5f0408aa31ebe60f" ||
    meta.toolchain !== "go1.27.3" ||
    meta.binarySha256 !== createHash("sha256").update(relay).digest("hex")
  )
    throw Error(
      "Le relais embarqué ne correspond pas à la plateforme/architecture cible. Relancer setup:video pour cette cible.",
    );
  if (platform === "darwin") {
    for (const [locale, description] of Object.entries({
      fr: "Quasar recherche et configure vos caméras IP via la connexion Ethernet de votre hub.",
      en: "Quasar discovers and configures your IP cameras through your hub’s Ethernet connection.",
    })) {
      const folder = path.join(resourceRoot, `${locale}.lproj`);
      await mkdir(folder, { recursive: true });
      await writeFile(
        path.join(folder, "InfoPlist.strings"),
        `"NSLocalNetworkUsageDescription" = "${description}";\n`,
      );
    }
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
