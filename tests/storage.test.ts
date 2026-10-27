import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { appPaths, migrateLegacy } from "../src/main/storage";
it("sépare ressources, données et tests sans dépendre du dossier source", () => {
  const p = appPaths(
    "/source",
    "/installed/resources",
    "/users/data",
    "/isolated-test",
  );
  expect(p.data).toBe("/isolated-test");
  expect(p.resources).toBe("/installed/resources");
  expect(p.electron).toBe(path.join("/isolated-test", "electron"));
});
it("migre sans effacer, préserve la destination et exclut captures, secrets de probes et caches", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "quasar-migration-")),
    source = path.join(temp, "legacy"),
    target = path.join(temp, "data");
  try {
    for (const name of [
      "profile-journal/backups",
      "osd",
      "electron/Local Storage",
      "electron/Cache",
      "probes",
    ]) {
      await mkdir(path.join(source, name), { recursive: true });
      await writeFile(path.join(source, name, "fixture.json"), name);
    }
    await writeFile(path.join(source, "camera-defaults.json"), "old profile");
    await mkdir(target);
    await writeFile(path.join(target, "camera-defaults.json"), "new profile");
    const first = await migrateLegacy(source, target);
    expect(first.copied).toBe(3);
    expect(first.preserved).toBe(1);
    expect(
      await readFile(path.join(target, "camera-defaults.json"), "utf8"),
    ).toBe("new profile");
    expect(
      await readFile(path.join(source, "camera-defaults.json"), "utf8"),
    ).toBe("old profile");
    await expect(
      readFile(path.join(target, "probes/fixture.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(target, "electron/Cache/fixture.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect((await migrateLegacy(source, target)).copied).toBe(0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it("reprend une migration interrompue sans écraser les fichiers déjà copiés", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "quasar-migration-retry-"));
  const source = path.join(temp, "legacy"),
    target = path.join(temp, "data");
  try {
    await mkdir(path.join(source, "profile-journal"), { recursive: true });
    await mkdir(target);
    await writeFile(
      path.join(source, "camera-defaults.json"),
      "source profile",
    );
    await writeFile(
      path.join(source, "profile-journal", "report.json"),
      "journal",
    );
    await writeFile(
      path.join(target, "profile-journal"),
      "destination conflict",
    );
    await expect(migrateLegacy(source, target)).rejects.toThrow();
    expect(
      await readFile(path.join(target, "camera-defaults.json"), "utf8"),
    ).toBe("source profile");
    await expect(
      readFile(path.join(target, "migration-v1.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(
      path.join(target, "camera-defaults.json"),
      "newer local profile",
    );
    await rm(path.join(target, "profile-journal"));
    expect(await migrateLegacy(source, target)).toEqual({
      copied: 1,
      preserved: 1,
    });
    expect(
      await readFile(path.join(target, "camera-defaults.json"), "utf8"),
    ).toBe("newer local profile");
    expect(
      await readFile(
        path.join(source, "profile-journal", "report.json"),
        "utf8",
      ),
    ).toBe("journal");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
