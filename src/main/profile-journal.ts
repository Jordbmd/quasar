import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  unlink,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { type ProfileRun, summarizeRun } from "../shared/profile-journal";
import type { FactoryResetPlan } from "../shared/factory-reset";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limit = 50;
export class ProfileJournal {
  private memory = new Map<string, ProfileRun>();
  private active = new Set<string>();
  constructor(private directory?: string) {}
  async saveFactoryReset(plan: FactoryResetPlan) {
    this.file(plan.id);
    if (!this.directory) return;
    const directory = path.join(this.directory, "factory-resets");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, plan.id + ".json"),
      tmp = file + ".tmp";
    await writeFile(tmp, JSON.stringify(plan, null, 2), { mode: 0o600 });
    await rename(tmp, file);
  }
  async backupVendor(
    camera: { ip?: string; serial?: string; mac?: string },
    group: string,
    xml: string,
  ) {
    const id = randomUUID();
    if (this.directory) {
      const folder = path.join(this.directory, "backups");
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await writeFile(
        path.join(folder, id + ".json"),
        JSON.stringify({
          id,
          createdAt: new Date().toISOString(),
          camera,
          group,
          xml,
        }),
        { mode: 0o600, flag: "wx" },
      );
    }
    return id;
  }
  private file(id: string) {
    if (!uuid.test(id)) throw Error("Identifiant de journal invalide.");
    return path.join(this.directory || ".", id + ".json");
  }
  private decode(raw: string): ProfileRun {
    const r = JSON.parse(raw);
    if (
      !uuid.test(r?.id) ||
      !["audit", "apply"].includes(r.kind) ||
      !["running", "complete", "interrupted"].includes(r.status) ||
      !Array.isArray(r.cameras) ||
      r.cameras.length > 256 ||
      r.cameras.some(
        (c: any) => !c.camera || !Array.isArray(c.rows) || c.rows.length > 100,
      )
    )
      throw Error("Journal invalide.");
    return r;
  }
  private recovered(run: ProfileRun) {
    if (run.status === "running" && !this.active.has(run.id)) {
      run.status = "interrupted";
      for (const c of run.cameras)
        for (const r of c.rows)
          if (r.state === "ready") {
            r.state = "skipped";
            r.code = "INTERRUPTED";
            r.message = r.startedAt
              ? "L’application s’est arrêtée pendant ce groupe. État réel à relire, aucune nouvelle tentative automatique."
              : "L’application s’est arrêtée avant cette étape.";
          }
    }
    return run;
  }
  async save(run: ProfileRun) {
    this.file(run.id); // Validate even for the in-memory implementation.
    if (this.directory) {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const file = this.file(run.id),
        tmp = file + "." + randomUUID() + ".tmp";
      await writeFile(tmp, JSON.stringify(run, null, 2), { mode: 0o600 });
      await rename(tmp, file);
    }
    this.memory.set(run.id, structuredClone(run));
    if (run.status === "running") this.active.add(run.id);
    else this.active.delete(run.id);
  }
  async get(id: string): Promise<ProfileRun> {
    let result: ProfileRun;
    if (this.directory) {
      const file = this.file(id);
      if ((await stat(file)).size > 16000000)
        throw Error("Journal trop volumineux.");
      result = this.decode(await readFile(file, "utf8"));
    } else {
      this.file(id);
      const r = this.memory.get(id);
      if (!r) throw Error("Journal introuvable.");
      result = structuredClone(r);
    }
    return this.recovered(result);
  }
  async list() {
    const ids = this.directory
      ? await readdir(this.directory).catch((e) => {
          if (e.code === "ENOENT") return [];
          throw e;
        })
      : [...this.memory.keys()].map((id) => id + ".json");
    const runs = [];
    for (const file of ids.filter(
      (f) => f.endsWith(".json") && uuid.test(f.slice(0, -5)),
    )) {
      runs.push(summarizeRun(await this.get(file.slice(0, -5))));
    }
    return runs
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  }
  async prune() {
    if (!this.directory) {
      const old = [...this.memory.values()]
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(limit);
      for (const r of old) if (!this.active.has(r.id)) this.memory.delete(r.id);
      return;
    }
    const files = (await readdir(this.directory)).filter(
      (f) => f.endsWith(".json") && uuid.test(f.slice(0, -5)),
    );
    const runs = await Promise.all(
      files.map(async (f) => ({
        file: f,
        mtime: (await stat(path.join(this.directory!, f))).mtimeMs,
      })),
    );
    for (const f of runs.sort((a, b) => b.mtime - a.mtime).slice(limit))
      if (!this.active.has(f.file.slice(0, -5))) {
        await unlink(path.join(this.directory!, f.file));
        this.memory.delete(f.file.slice(0, -5));
      }
  }
}
