// Lifetime is tied to Electron's pipe, including an abrupt parent crash.
const { spawn, execFile } = require("node:child_process");
const path = require("node:path");
const windows = process.platform === "win32";
const child = spawn(
  process.argv[2],
  ["-config", require("node:fs").readFileSync(process.argv[3], "utf8")],
  {
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
    // A dedicated POSIX process group also contains any future descendants.
    detached: !windows,
  },
);
let stopping = false;
function terminate(signal) {
  if (!child.pid || child.exitCode !== null) return;
  if (windows) {
    execFile(
      path.win32.join(
        process.env.SystemRoot || "C:\\Windows",
        "System32",
        "taskkill.exe",
      ),
      ["/PID", String(child.pid), "/T", "/F"],
      { windowsHide: true },
      (error) => {
        if (error && child.exitCode === null) child.kill();
      },
    );
  } else {
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") process.exitCode = 1;
    }
  }
}
function stop() {
  if (stopping) return;
  stopping = true;
  terminate("SIGTERM");
  setTimeout(() => terminate("SIGKILL"), 1500).unref();
}
process.stdin.resume();
process.stdin.on("end", stop);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("error", () => process.exit(1));
child.on("exit", (code) => process.exit(code ?? 0));
