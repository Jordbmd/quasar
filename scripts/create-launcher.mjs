import {
  access,
  cp,
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import { assignAppUUID } from "./macho-identity.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "darwin")
  throw new Error("Cette application est destinée à macOS.");
for (const file of [
  "dist/main/main.cjs",
  "dist/main/preload.cjs",
  "dist/renderer/index.html",
])
  await access(path.join(root, file));
const output = path.join(root, "Quasar.app");
const staging = path.join(root, ".runtime", "Quasar-build.app");
await rm(staging, { recursive: true, force: true });
await mkdir(path.dirname(staging), { recursive: true });
await cp(path.join(root, "node_modules/electron/dist/Electron.app"), staging, {
  recursive: true,
  verbatimSymlinks: true,
});
const contents = path.join(staging, "Contents");
await rename(
  path.join(contents, "MacOS/Electron"),
  path.join(contents, "MacOS/Quasar"),
);
const executable = path.join(contents, "MacOS/Quasar");
const binary = await readFile(executable);
const appUUID = assignAppUUID(binary, "fr.sezaam.camera-tool");
await writeFile(executable, binary);
const plist = path.join(contents, "Info.plist");
for (const [key, value] of Object.entries({
  CFBundleName: "Quasar",
  CFBundleDisplayName: "Quasar",
  CFBundleIdentifier: "fr.sezaam.camera-tool",
  CFBundleExecutable: "Quasar",
  CFBundleIconFile: "quasar.icns",
  CFBundleVersion: "3",
  CFBundleShortVersionString: "0.2.0",
}))
  await exec("/usr/libexec/PlistBuddy", [
    "-c",
    `Set :${key} ${value}`,
    plist,
  ]).catch(() =>
    exec("/usr/libexec/PlistBuddy", [
      "-c",
      `Add :${key} string ${value}`,
      plist,
    ]),
  );
await exec("/usr/libexec/PlistBuddy", [
  "-c",
  "Add :NSLocalNetworkUsageDescription string Quasar recherche et configure vos caméras IP via la connexion Ethernet de votre hub.",
  plist,
]);
await cp(
  path.join(root, "build/icons/quasar.icns"),
  path.join(contents, "Resources/quasar.icns"),
);
const appDir = path.join(contents, "Resources/app");
await mkdir(appDir, { recursive: true });
await writeFile(
  path.join(appDir, "package.json"),
  JSON.stringify({
    name: "sezaam-camera-tool",
    productName: "Quasar",
    version: "0.2.0",
    main: "index.cjs",
  }),
);
// Native executable in its own bundle: Launch Services can attribute network consent
// to Quasar. The project and its dependencies remain the source of application code.
await writeFile(
  path.join(appDir, "index.cjs"),
  `const path = require('node:path');
const fs = require('node:fs');
const {app, dialog} = require('electron');
const sibling = path.resolve(__dirname, '../../../..');
const root = fs.existsSync(path.join(sibling, 'dist/main/main.cjs')) ? sibling : ${JSON.stringify(root)};
delete process.env.SEZAAM_DEV_URL;
if (!fs.existsSync(path.join(root, 'dist/main/main.cjs'))) {
 app.whenReady().then(() => {dialog.showErrorBox('Quasar', 'Le dossier du projet Quasar est introuvable. Rétablissez son emplacement puis rouvrez l’application.');app.quit();});
} else {process.chdir(root);require(path.join(root, 'dist/main/main.cjs'));}
`,
);
// Ad-hoc signing is for this local build, not notarization or distribution.
await exec("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", staging]);
await exec("/usr/bin/codesign", ["--verify", "--deep", "--strict", staging]);
const previous = path.join(root, ".runtime", "previous-launcher.app.backup");
await rm(previous, { recursive: true, force: true });
await rename(output, previous).catch((e) => {
  if (e.code !== "ENOENT") throw e;
});
await rename(staging, output);
console.log(`Application créée et signature locale vérifiée : ${output}`);
console.log(`Identité du binaire Quasar : ${appUUID}`);
