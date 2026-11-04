import { build } from "esbuild";
await build({
  entryPoints: ["web/server/index.mjs"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outfile: "portal-dist/server.mjs",
});
