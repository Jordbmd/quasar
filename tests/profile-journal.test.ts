import { expect, it } from "vitest";
import { mkdtemp, rm, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProfileJournal } from "../src/main/profile-journal";
import type { ProfileRun } from "../src/shared/profile-journal";
function run(): ProfileRun {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name: "Sezaam",
    revision: 1,
    createdAt: now,
    startedAt: now,
    updatedAt: now,
    kind: "apply",
    status: "running",
    cameras: [
      {
        camera: {
          id: "camera",
          ip: "192.0.2.11",
          port: 80,
          path: "/onvif/device_service",
          status: "Connectée",
          ambiguous: false,
        },
        rows: [
          {
            id: "brightness",
            label: "Luminosité",
            value: 128,
            state: "ready",
            message: "Prêt",
            startedAt: now,
          },
          {
            id: "fps",
            label: "Cadence",
            value: 25,
            state: "ready",
            message: "Prêt",
          },
          {
            id: "codec",
            label: "Codec",
            value: "H264",
            observed: "H264",
            state: "verified",
            message: "Vérifié",
          },
        ],
      },
    ],
  };
}
it("persiste, protège le fichier et signale une interruption après redémarrage sans inventer un échec", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "quasar-journal-"));
  try {
    const j = new ProfileJournal(dir),
      r = run();
    await j.save(r);
    expect((await j.get(r.id)).status).toBe("running");
    expect((await stat(path.join(dir, r.id + ".json"))).mode & 0o777).toBe(
      0o600,
    );
    const reopened = await new ProfileJournal(dir).get(r.id);
    expect(reopened.status).toBe("interrupted");
    expect(reopened.cameras[0].rows.map((r) => r.state)).toEqual([
      "skipped",
      "skipped",
      "verified",
    ]);
    expect(reopened.cameras[0].rows[0].message).toContain("État réel à relire");
    expect(reopened.cameras[0].rows[1].message).toContain("avant cette étape");
    expect(
      JSON.parse(await readFile(path.join(dir, r.id + ".json"), "utf8")).status,
    ).toBe("running");
    await expect(j.get("../escape")).rejects.toThrow("invalide");
    await writeFile(path.join(dir, r.id + ".json"), "{invalid");
    await expect(j.get(r.id)).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("limite l’historique aux cinquante derniers rapports terminés", async () => {
  const j = new ProfileJournal();
  const ids = [];
  for (let i = 0; i < 55; i++) {
    const r = run();
    r.status = "complete";
    r.startedAt = new Date(i * 1000).toISOString();
    ids.push(r.id);
    await j.save(r);
  }
  await j.prune();
  const list = await j.list();
  expect(list).toHaveLength(50);
  expect(list[0].id).toBe(ids.at(-1));
  await expect(j.get(ids[0])).rejects.toThrow("introuvable");
});
