import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AutoLoginStore } from "../src/main/auto-login";
import { schemas } from "../src/shared/ipc-schemas";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "quasar-login-test-"));
  dirs.push(dir);
  const file = path.join(dir, "camera-login.enc");
  const key = randomBytes(32);
  let available = true;
  const cipher = {
    available: async () => available,
    encrypt: async (s: string) => {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([c.update(s), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), data]);
    },
    decrypt: async (b: Buffer) => {
      const c = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
      c.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString();
    },
  };
  return {
    file,
    store: new AutoLoginStore(file, cipher),
    restart: () => new AutoLoginStore(file, cipher),
    unavailable: () => {
      available = false;
    },
  };
}
it("ne conserve que du chiffré, retrouve le compte après redémarrage sans exposer le secret au renderer", async () => {
  const f = await fixture();
  expect(await f.store.status()).toEqual({
    enabled: false,
    available: true,
    username: undefined,
  });
  await f.store.save({
    enabled: true,
    username: "admin",
    password: "TEST-SECRET",
  });
  expect((await readFile(f.file)).includes(Buffer.from("TEST-SECRET"))).toBe(
    false,
  );
  if (process.platform !== "win32")
    expect((await stat(f.file)).mode & 0o777).toBe(0o600);
  expect(await f.restart().credentials()).toEqual({
    username: "admin",
    password: "TEST-SECRET",
  });
  expect(JSON.stringify(await f.store.status())).not.toContain("TEST-SECRET");
});
it("conserve le mot de passe omis, accepte sa modification, refuse le changement de compte sans secret", async () => {
  const { store } = await fixture();
  await store.save({ enabled: true, username: "admin", password: "first" });
  await store.save({ enabled: true, username: "admin" });
  expect((await store.credentials())?.password).toBe("first");
  await expect(
    store.save({ enabled: true, username: "other" }),
  ).rejects.toThrow("mot de passe");
  await store.save({ enabled: true, username: "other", password: "second" });
  expect(await store.credentials()).toEqual({
    username: "other",
    password: "second",
  });
});
it("supprime la mémorisation même lorsque le coffre est indisponible", async () => {
  const f = await fixture();
  await f.store.save({ enabled: true, username: "admin", password: "secret" });
  f.unavailable();
  await expect(f.store.credentials()).rejects.toThrow("indisponible");
  await expect(
    f.store.save({ enabled: true, username: "admin", password: "secret" }),
  ).rejects.toThrow("indisponible");
  expect((await f.store.save({ enabled: false })).enabled).toBe(false);
  await expect(readFile(f.file)).rejects.toMatchObject({ code: "ENOENT" });
});
it("signale un fichier illisible sans réutiliser les identifiants par défaut", async () => {
  const f = await fixture();
  await writeFile(f.file, "corrupted");
  expect(await f.store.status()).toMatchObject({
    enabled: false,
    error: expect.stringContaining("déverrouiller"),
  });
  await expect(f.store.credentials()).rejects.toThrow("déverrouiller");
  expect(await readFile(f.file, "utf8")).toBe("corrupted");
});
it("valide strictement les nouvelles commandes IPC", () => {
  expect(
    schemas.saveAutoLogin.safeParse({
      enabled: true,
      username: "",
      password: "x",
    }).success,
  ).toBe(false);
  expect(
    schemas.saveAutoLogin.safeParse({ enabled: false, password: "x" }).success,
  ).toBe(false);
  expect(schemas.connectSavedSession.safeParse({ password: "x" }).success).toBe(
    false,
  );
});
