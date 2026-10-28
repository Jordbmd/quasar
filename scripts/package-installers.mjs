import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const requested = process.argv[2];
const targetArch = process.env.QUASAR_TARGET_ARCH;
const targets = {
  mac: {
    platform: "darwin",
    arch:
      targetArch || (process.platform === "darwin" ? process.arch : "arm64"),
    folder: "macOS",
    extension: ".dmg",
  },
  win: { platform: "win32", arch: "x64", folder: "Windows", extension: ".exe" },
  linux: {
    platform: "linux",
    arch: "x64",
    folder: "Linux",
    extension: ".AppImage",
  },
};
const names = requested === "all" ? Object.keys(targets) : [requested];
if (names.some((name) => !targets[name]))
  throw Error("Cible attendue : mac, win, linux ou all.");
if (names.includes("mac") && process.platform !== "darwin")
  throw Error("Le DMG doit être préparé sur macOS.");
if (targetArch && !["arm64", "x64"].includes(targetArch))
  throw Error("Architecture Mac attendue : arm64 ou x64.");
if (targetArch && names.some((name) => name !== "mac") && targetArch !== "x64")
  throw Error(
    "Windows et Linux ciblent x64 ; ne pas imposer une autre architecture au lot.",
  );
if (names.includes("win") && !["darwin", "win32"].includes(process.platform))
  throw Error("Préparer l’installateur Windows sur macOS ou Windows.");

// Pinned official builder image: isolated build inputs, no repository credentials,
// user data, Docker socket, host environment forwarding or privileged container.
const linuxImage =
  "electronuserland/builder:24@sha256:22c93521ff6ea682e7ef153bb4846d90b769aa3b3f3f3be9ec9090aabc3e877c";
const output = path.join(root, "release", "installers");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const builder = require.resolve("electron-builder/cli.js");
const dockerLinux = process.platform !== "linux" || process.arch !== "x64";
async function run(command, args, env = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: "inherit",
      shell: process.platform === "win32" && command === npm,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(
            Error(`${path.basename(command)} interrompu (${signal || code}).`),
          ),
    );
  });
}
async function digest(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function linuxInDocker(video, folder, work) {
  const context = path.join(work, "linux-context");
  await mkdir(context);
  for (const file of [
    "package.json",
    "package-lock.json",
    "electron-builder.config.cjs",
  ])
    await copyFile(path.join(root, file), path.join(context, file));
  for (const directory of ["dist", "build/icons"])
    await cp(path.join(root, directory), path.join(context, directory), {
      recursive: true,
    });
  await mkdir(path.join(context, "scripts"));
  for (const file of [
    "after-pack.cjs",
    "linux-apprun.sh",
    "macho-identity.mjs",
    "video-supervisor.cjs",
  ])
    await copyFile(
      path.join(root, "scripts", file),
      path.join(context, "scripts", file),
    );
  await cp(video, path.join(context, "video"), { recursive: true });
  await run("docker", [
    "run",
    "--rm",
    "--platform",
    "linux/amd64",
    "--mount",
    `type=bind,source=${context},target=/project`,
    "--workdir",
    "/project",
    "--env",
    "ELECTRON_SKIP_BINARY_DOWNLOAD=1",
    "--env",
    "QUASAR_VIDEO_DIR=/project/video",
    linuxImage,
    "/bin/bash",
    "-euc",
    "npm ci --no-audit --no-fund && node node_modules/electron-builder/cli.js --linux AppImage --x64 --config electron-builder.config.cjs --config.directories.output=/project/output --publish never",
  ]);
  for (const file of await readdir(path.join(context, "output")))
    if (file.endsWith(".AppImage"))
      await copyFile(
        path.join(context, "output", file),
        path.join(folder, file),
      );
}
if (names.includes("linux") && dockerLinux)
  await run("docker", ["info", "--format", "Docker {{.ServerVersion}}"]);
await run(npm, ["run", "build"]);
await mkdir(output, { recursive: true });
const work = await mkdtemp(path.join(output, ".packaging-"));
const manifest = {
  version: JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
    .version,
  files: [],
};
try {
  for (const name of names) {
    const target = targets[name];
    const video = path.join(work, `${target.platform}-${target.arch}`);
    const folder = path.join(output, target.folder);
    const buildFolder = path.join(work, `${name}-output`);
    await mkdir(folder, { recursive: true });
    await mkdir(buildFolder);
    await run(
      process.execPath,
      [path.join(root, "scripts/install-video.mjs")],
      {
        QUASAR_TARGET_PLATFORM: target.platform,
        QUASAR_TARGET_ARCH: target.arch,
        QUASAR_VIDEO_DIR: video,
      },
    );
    if (name === "linux" && dockerLinux) {
      await linuxInDocker(video, buildFolder, work);
    } else {
      await run(
        process.execPath,
        [
          builder,
          `--${name === "win" ? "win" : name === "mac" ? "mac" : "linux"}`,
          `--${target.arch}`,
          "--config",
          "electron-builder.config.cjs",
          `--config.directories.output=${buildFolder}`,
          "--publish",
          "never",
        ],
        { QUASAR_VIDEO_DIR: video },
      );
    }
    const installers = (await readdir(buildFolder)).filter((file) =>
      file.endsWith(target.extension),
    );
    if (installers.length !== 1)
      throw Error(
        `Un installateur ${target.folder} attendu, ${installers.length} trouvé(s).`,
      );
    const file = installers[0];
    const sha256 = await digest(path.join(buildFolder, file));
    const temporary = path.join(folder, `.${file}.tmp`);
    await copyFile(path.join(buildFolder, file), temporary);
    await rename(temporary, path.join(folder, file));
    // Replace old generated versions only after a complete installer is ready.
    for (const previous of await readdir(folder))
      if (
        previous !== file &&
        previous.startsWith("Quasar-") &&
        previous.endsWith(target.extension)
      )
        await rm(path.join(folder, previous));
    manifest.files.push({
      platform: target.platform,
      arch: target.arch,
      file: `${target.folder}/${file}`,
      sha256,
    });
    await writeFile(
      path.join(folder, "SHA256SUMS.txt"),
      `${sha256}  ${file}\n`,
    );
    const instructions =
      name === "mac"
        ? `Quasar pour macOS ${target.arch === "arm64" ? "Apple Silicon (M1, M2, M3, M4 et suivants)" : "Intel"}.\nOuvrir le DMG puis glisser Quasar dans Applications.\nAutoriser le réseau local lors de la première recherche de caméras.\nCette version est signée localement, sans notarisation Apple. Si macOS la bloque, utiliser Réglages Système > Confidentialité et sécurité > Ouvrir quand même.\n`
        : name === "win"
          ? "Quasar pour Windows 64 bits.\nOuvrir le fichier Setup.exe et suivre l’installation pour votre compte utilisateur.\nLe compte administrateur n’est pas nécessaire. L’application est accessible dans le menu Démarrer.\nCet installateur ne dispose pas de certificat de signature de distribution ; Windows peut afficher un avertissement de provenance.\n"
          : "Quasar pour Linux 64 bits (x86_64).\nDans les propriétés du fichier AppImage, autoriser son exécution comme programme, puis double-cliquer.\nUn bureau graphique et le support AppImage/FUSE de la distribution sont nécessaires. Le bac à sable Electron reste activé.\nLa commande ip (iproute2) est requise pour détecter la connexion Ethernet.\n";
    await writeFile(
      path.join(folder, "INSTALLATION.txt"),
      instructions +
        "\nElectron, Quasar et le relais vidéo sont inclus ; Node.js et le dépôt source ne sont pas nécessaires.\nLe profil Sezaam est intégré. Les identifiants des caméras sont saisis dans l’application.\n",
    );
    console.log(`Installateur prêt : ${path.join(folder, file)}`);
  }
  await writeFile(
    path.join(output, `manifest-${names.join("-")}.json`),
    JSON.stringify(manifest, null, 2) + "\n",
  );
} finally {
  await rm(work, { recursive: true, force: true });
}
