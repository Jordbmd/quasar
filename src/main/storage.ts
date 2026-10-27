import path from "node:path";
import { constants } from "node:fs";
import {
  mkdir,
  readdir,
  lstat,
  copyFile,
  link,
  unlink,
  writeFile,
  readFile,
  rename,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";

export function appPaths(
  root: string,
  resources: string,
  appData: string,
  testData?: string,
) {
  const data = testData || path.join(appData, "sezaam-camera-tool");
  return {
    resources,
    data,
    electron: path.join(data, "electron"),
    temporary: path.join(data, "temporary"),
    logs: path.join(data, "logs"),
    legacy: path.join(root, ".runtime"),
  };
}

const durable = ["camera-defaults.json", "profile-journal", "osd", "backups"];
// Copy Chromium's durable preferences only, never live locks or caches.
const preferences = [
  "Preferences",
  "Local State",
  "Local Storage",
  "IndexedDB",
];

/** Copy only known durable data. Never overwrite, move or delete a source.
 * Temp copy + hard-link publication avoids a partial destination after a crash.
 * A failed run can be repeated; existing destinations always win. */
export async function migrateLegacy(source: string, target: string) {
  if (path.resolve(source) === path.resolve(target))
    return { copied: 0, preserved: 0 };
  const report = { copied: 0, preserved: 0 };
  const marker = path.join(target, "migration-v1.json");
  try {
    const previous: unknown = JSON.parse(await readFile(marker, "utf8"));
    if (
      previous &&
      typeof previous === "object" &&
      "source" in previous &&
      previous.source === path.resolve(source)
    )
      return report;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await lstat(source);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return report;
    throw error;
  }
  async function copy(relative: string): Promise<void> {
    const from = path.join(source, relative),
      to = path.join(target, relative);
    let stat;
    try {
      stat = await lstat(from);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink())
      throw Error(`Migration refusée : lien symbolique dans ${relative}.`);
    if (stat.isDirectory()) {
      await mkdir(to, { recursive: true, mode: 0o700 });
      if ((await lstat(to)).isSymbolicLink())
        throw Error("Destination de migration non sûre.");
      for (const name of await readdir(from))
        await copy(path.join(relative, name));
    } else if (stat.isFile()) {
      await mkdir(path.dirname(to), { recursive: true, mode: 0o700 });
      const temp = to + ".migration-" + randomUUID();
      try {
        await copyFile(from, temp, constants.COPYFILE_EXCL);
        try {
          await link(temp, to);
          report.copied++;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST")
            report.preserved++;
          else throw error;
        }
      } finally {
        await unlink(temp).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    }
  }
  await mkdir(target, { recursive: true, mode: 0o700 });
  for (const relative of [
    ...durable,
    ...preferences.map((name) => path.join("electron", name)),
  ])
    await copy(relative);
  const stagedMarker = marker + "." + randomUUID();
  await writeFile(
    stagedMarker,
    JSON.stringify(
      {
        version: 1,
        source: path.resolve(source),
        at: new Date().toISOString(),
        ...report,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  await rename(stagedMarker, marker);
  return report;
}
