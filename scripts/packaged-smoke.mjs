import path from "node:path";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";

const candidates =
  process.platform === "win32"
    ? ["release/win-unpacked/Quasar.exe"]
    : process.platform === "darwin"
      ? [
          `release/mac${process.arch === "arm64" ? "-arm64" : ""}/Quasar.app/Contents/MacOS/Quasar`,
        ]
      : ["release/linux-unpacked/quasar"];
const executable = path.resolve(candidates[0]);
await access(executable);
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["scripts/smoke.mjs"], {
    stdio: "inherit",
    env: { ...process.env, QUASAR_PACKAGED_EXECUTABLE: executable },
  });
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0 ? resolve() : reject(Error(`Packaged smoke failed: ${code}`)),
  );
});
