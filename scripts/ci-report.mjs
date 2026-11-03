import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const state = process.env.QUASAR_CI_STATUS;
const status =
  state === "success" ? "ok" : state === "failure" ? "failed" : "unknown";
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/platform-report.json",
  JSON.stringify(
    {
      schemaVersion: 1,
      project: "quasar",
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      generatedAt: new Date().toISOString(),
      tool: "github-actions",
      kind: "ci",
      status,
      summary:
        status === "ok"
          ? "passed"
          : status === "failed"
            ? "failed"
            : "unavailable",
    },
    null,
    2,
  ) + "\n",
);
