import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
await build({
  entryPoints: ["src/main/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist/main/main.cjs",
  external: ["electron", "onvif"],
  sourcemap: true,
});
await build({
  entryPoints: ["src/main/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist/main/preload.cjs",
  external: ["electron"],
});
await writeFile(
  "dist/version.json",
  JSON.stringify(
    {
      schemaVersion: 1,
      project: "quasar",
      version: JSON.parse(await readFile("package.json", "utf8")).version,
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      workingTreeDirty: !!execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim(),
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);
