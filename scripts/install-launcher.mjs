// Local, reversible update. Runtime preferences and camera backups stay in the project.
import { cp, mkdir, rename, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
const exec = promisify(execFile),
  root = process.cwd(),
  apps = path.join(os.homedir(), "Applications"),
  source = path.join(root, "Quasar.app"),
  destination = path.join(apps, "Quasar.app");
if (process.platform !== "darwin")
  throw Error("Installation locale macOS uniquement.");
await access(source);
await exec("/usr/bin/codesign", ["--verify", "--deep", "--strict", source]);
await mkdir(apps, { recursive: true });
const backup = path.join(root, ".runtime", "launchers-" + Date.now());
await mkdir(backup, { recursive: true });
const register =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
for (const name of ["Sezaam.app", "Quasar.app"]) {
  const existing = path.join(apps, name);
  try {
    await access(existing);
  } catch (e) {
    if (e.code === "ENOENT") continue;
    throw e;
  }
  await exec(register, ["-u", existing]).catch(() => {});
  await rename(existing, path.join(backup, name + ".backup"));
}
await cp(source, destination, { recursive: true, verbatimSymlinks: true });
await exec("/usr/bin/codesign", [
  "--verify",
  "--deep",
  "--strict",
  destination,
]);
await exec(register, ["-f", destination]);
await exec("/usr/bin/mdimport", [destination]);
console.log(
  `Quasar installé : ${destination}\nAncien lanceur conservé : ${backup}`,
);
