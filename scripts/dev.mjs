import { createServer } from "vite";
import { spawn } from "node:child_process";
import electron from "electron";
await import("./build-main.mjs");
const server = await createServer();
await server.listen();
const env = { ...process.env, SEZAAM_DEV_URL: "http://127.0.0.1:5173" };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ["."], { stdio: "inherit", env });
const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
