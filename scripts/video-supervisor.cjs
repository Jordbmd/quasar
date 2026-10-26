// Lifetime is tied to Electron's pipe, including an abrupt parent crash.
const { spawn } = require("node:child_process");
const child = spawn(
  process.argv[2],
  ["-config", require("node:fs").readFileSync(process.argv[3], "utf8")],
  { stdio: ["ignore", "ignore", "ignore"] },
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  child.kill("SIGTERM");
  setTimeout(() => {
    child.kill("SIGKILL");
    process.exit(0);
  }, 1500).unref();
}
process.stdin.resume();
process.stdin.on("end", stop);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("error", () => process.exit(1));
child.on("exit", (code) => process.exit(code ?? 0));
