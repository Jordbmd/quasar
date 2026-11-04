import { execFileSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rename,
  rm,
  chmod,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { version, videoAsset } from "./video-assets.mjs";

// Go is build tooling only. No compiler or module cache enters the product.
const go = process.env.QUASAR_GO || "go";
const platform = process.env.QUASAR_TARGET_PLATFORM || process.platform;
const arch = process.env.QUASAR_TARGET_ARCH || process.arch;
const asset = videoAsset(platform, arch);
const root = process.cwd();
const sourceCommit = "7c05066c90ab6ad1fccb506d5f0408aa31ebe60f";
const env = { ...process.env, GOTOOLCHAIN: "local", CGO_ENABLED: "0" };
const toolchain = execFileSync(go, ["env", "GOVERSION"], {
  env,
  encoding: "utf8",
}).trim();
if (toolchain !== "go1.27.3") throw Error("Build requires exactly Go 1.27.3");
const moduleInfo = JSON.parse(
  execFileSync(
    go,
    ["mod", "download", "-json", `github.com/AlexxIT/go2rtc@${sourceCommit}`],
    { env, encoding: "utf8", timeout: 120000 },
  ),
);
const expected = "h1:2WfyfWWVJCvcedlSQDpnyBZ1LlIOMvkWVc1BiiPNAJc=";
if (
  moduleInfo.Sum !== expected ||
  moduleInfo.Path !== "github.com/AlexxIT/go2rtc" ||
  moduleInfo.Version !== version ||
  moduleInfo.Query !== sourceCommit ||
  (moduleInfo.Origin?.Hash && moduleInfo.Origin.Hash !== sourceCommit)
)
  throw Error("Upstream source provenance mismatch");
await mkdir(".local", { recursive: true });
const work = await mkdtemp(path.join(root, ".local", "relay-build-"));
const destination = path.resolve(process.env.QUASAR_VIDEO_DIR || "bin");
async function writableDirectories(directory) {
  // Go module cache directories are read-only on POSIX; cp preserves that mode.
  // Change only the disposable copy, never the shared verified module cache.
  await chmod(directory, 0o700);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory())
      await writableDirectories(path.join(directory, entry.name));
  }
}
try {
  await cp(moduleInfo.Dir, work, { recursive: true });
  await writableDirectories(work);
  const hashes = {};
  for (const file of ["go.mod", "go.sum"]) {
    const bytes = await readFile(path.join(root, "config/go2rtc", file));
    await rm(path.join(work, file));
    await writeFile(path.join(work, file), bytes);
    hashes[file] = createHash("sha256").update(bytes).digest("hex");
  }
  await mkdir(destination, { recursive: true });
  await cp(
    path.join(work, "LICENSE"),
    path.join(destination, "go2rtc-LICENSE.txt"),
  );
  const output = path.join(destination, asset.executable);
  execFileSync(
    go,
    [
      "build",
      "-mod=readonly",
      "-buildvcs=false",
      "-trimpath",
      "-ldflags",
      "-s -w",
      "-o",
      output + ".tmp",
      ".",
    ],
    {
      cwd: work,
      env: {
        ...env,
        GOOS: platform === "win32" ? "windows" : platform,
        GOARCH: arch === "x64" ? "amd64" : arch,
      },
      stdio: "inherit",
      timeout: 300000,
    },
  );
  await rename(output + ".tmp", output);
  const binary = await readFile(output);
  await writeFile(
    path.join(destination, "go2rtc-version.json"),
    JSON.stringify(
      {
        version,
        platform,
        arch,
        sourceCommit,
        sourceModuleChecksum: expected,
        toolchain,
        dependencyLocks: hashes,
        binarySha256: createHash("sha256").update(binary).digest("hex"),
        distribution:
          "Quasar source rebuild with patched dependencies; not the upstream release binary",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `go2rtc ${version} ${platform}/${arch}: verified source, locked patched dependencies, ${toolchain}.`,
  );
} finally {
  await rm(work, { recursive: true, force: true });
}
