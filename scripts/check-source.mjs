import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" }).trimEnd();
const status = git("status", "--porcelain=v1");
const report = {
  schemaVersion: 1,
  commit: git("rev-parse", "HEAD"),
  generatedAt: new Date().toISOString(),
  workingTreeDirty: !!status,
  files: status ? status.split("\n") : [],
  diffStat: git("diff", "--stat", "HEAD"),
};
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/source-state.json",
  JSON.stringify(report, null, 2) + "\n",
);
if (report.workingTreeDirty) {
  console.error(
    "Generated source differs from the checkout; inspect source-state.json.\n" +
      status +
      "\n" +
      report.diffStat,
  );
  process.exitCode = 1;
} else console.log(`Clean source checkout: ${report.commit}`);
