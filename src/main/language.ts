import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { getLanguage, setLanguage, type Language } from "../shared/i18n";

/** One validated preference; this file never contains camera data or credentials. */
export class LanguagePreference {
  private file: string;
  private pending = Promise.resolve();
  constructor(directory: string) {
    this.file = path.join(directory, "language.json");
  }
  async load() {
    try {
      const saved: unknown = JSON.parse(await readFile(this.file, "utf8"));
      if (saved === "fr" || saved === "en") setLanguage(saved);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return getLanguage();
  }
  async save(language: Language) {
    const write = this.pending.then(async () => {
      await writeFile(`${this.file}.tmp`, JSON.stringify(language), {
        mode: 0o600,
      });
      await rename(`${this.file}.tmp`, this.file);
      setLanguage(language);
    });
    this.pending = write.catch(() => {});
    await write;
    return language;
  }
}
