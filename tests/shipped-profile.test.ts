import { it, expect } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import profile from "../config/sezaam-profile.json";
import { DefaultsStore } from "../src/main/defaults";
import { defaultFields, validateDefaults } from "../src/shared/defaults";

it("fournit le profil Sezaam versionné à une nouvelle installation, sans écrire sur disque", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "quasar-shipped-profile-"));
  try {
    const file = path.join(dir, "camera-defaults.json");
    const store = new DefaultsStore(file, profile);
    expect(validateDefaults(profile)).toEqual(profile);
    expect(Object.keys(profile.fields)).toHaveLength(defaultFields.length);
    const first = await store.read();
    expect(first).toEqual(profile);
    expect(first.fields.resolution.value).toBe("Résolution maximale");
    first.fields.fps.value = 20;
    expect((await store.read()).fields.fps.value).toBe(25);
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("préserve les choix locaux et refuse de remplacer un profil local illisible", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "quasar-local-profile-"));
  try {
    const file = path.join(dir, "camera-defaults.json");
    const store = new DefaultsStore(file, profile);
    const custom = await store.read();
    custom.fields.fps.value = 20;
    const saved = await store.save(custom);
    expect(saved.revision).toBe(profile.revision + 1);
    expect(await new DefaultsStore(file, profile).read()).toEqual(saved);
    expect(profile.fields.fps.value).toBe(25);
    await writeFile(file, "invalid json");
    await expect(new DefaultsStore(file, profile).read()).rejects.toThrow(
      "illisible",
    );
    expect(await readFile(file, "utf8")).toBe("invalid json");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
