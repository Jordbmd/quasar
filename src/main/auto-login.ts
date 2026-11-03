import { readFile, writeFile, rename, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  autoLoginInput,
  loginCredentials,
  type AutoLoginInput,
  type AutoLoginStatus,
} from "../shared/auto-login";

type Cipher = {
  available: () => Promise<boolean>;
  encrypt: (value: string) => Promise<Buffer>;
  decrypt: (value: Buffer) => Promise<string>;
};
/** Only ciphertext is persisted. No secret is returned over the settings IPC. */
export class AutoLoginStore {
  constructor(
    private file: string,
    private cipher: Cipher,
  ) {}
  private async exists() {
    try {
      return await readFile(this.file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw Error("Impossible de lire la connexion enregistrée.");
    }
  }
  async credentials() {
    const encrypted = await this.exists();
    if (!encrypted) return undefined;
    if (!(await this.cipher.available()))
      throw Error("Le stockage sécurisé des identifiants est indisponible.");
    try {
      return loginCredentials.parse(
        JSON.parse(await this.cipher.decrypt(encrypted)),
      );
    } catch {
      throw Error(
        "Impossible de déverrouiller les identifiants. Enregistrez-les à nouveau dans les paramètres.",
      );
    }
  }
  async status(): Promise<AutoLoginStatus> {
    const available = await this.cipher.available().catch(() => false);
    try {
      const credentials = await this.credentials();
      return {
        available,
        enabled: !!credentials,
        username: credentials?.username,
      };
    } catch (e) {
      return { available, enabled: false, error: (e as Error).message };
    }
  }
  async save(input: AutoLoginInput): Promise<AutoLoginStatus> {
    const value = autoLoginInput.parse(input);
    if (!value.enabled) {
      try {
        await unlink(this.file);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT")
          throw Error("Impossible de supprimer les identifiants enregistrés.");
      }
      return this.status();
    }
    if (!(await this.cipher.available()))
      throw Error("Le stockage sécurisé des identifiants est indisponible.");
    const previous =
      value.password === undefined ? await this.credentials() : undefined;
    if (
      value.password === undefined &&
      (!previous || previous.username !== value.username)
    )
      throw Error("Renseignez le mot de passe pour ce compte.");
    const credentials = loginCredentials.parse({
      username: value.username,
      password: value.password ?? previous!.password,
    });
    let encrypted: Buffer;
    try {
      encrypted = await this.cipher.encrypt(JSON.stringify(credentials));
    } catch {
      throw Error(
        "Impossible de protéger les identifiants. Rien n’a été enregistré.",
      );
    }
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      await writeFile(temporary, encrypted, { mode: 0o600, flag: "wx" });
      await rename(temporary, this.file);
    } catch {
      throw Error("Impossible d’enregistrer la connexion automatique.");
    } finally {
      await unlink(temporary).catch(() => {});
    }
    return { available: true, enabled: true, username: credentials.username };
  }
}
