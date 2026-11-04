import { execFileSync, spawn } from "node:child_process";
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
const commit = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(commit || ""))
  throw Error("Exact source commit required");
const image = `quasar-portal:${commit}`;
const docker = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
const info = JSON.parse(docker(["image", "inspect", image]))[0];
if (info.Config.Labels?.["org.opencontainers.image.revision"] !== commit)
  throw Error("Revision mismatch");
const container = `quasar-portal-verification-${process.pid}`;
try {
  docker([
    "run",
    "-d",
    "--name",
    container,
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    image,
  ]);
  const probe = `import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs';const version=JSON.parse(fs.readFileSync('/app/site-dist/version.json'));assert.equal(version.commit,${JSON.stringify(commit)});assert.equal(version.workingTreeDirty,false);assert.equal(process.getuid(),1000);for(const [path,status,host] of [['/healthz',200,'quasar.doublemart.fr'],['/fr/',200,'quasar.doublemart.fr'],['/en/',200,'quasar.doublemart.fr'],['/missing',404,'quasar.doublemart.fr'],['/server.mjs',404,'quasar.doublemart.fr'],['/fr/',421,'evil.test']])await new Promise((resolve,reject)=>http.get({host:'127.0.0.1',port:4350,path,headers:{Host:host}},r=>{assert.equal(r.statusCode,status);assert.match(r.headers['x-robots-tag'],/noindex/);r.resume();r.on('end',resolve)}).on('error',reject));`;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      docker(["exec", container, "node", "--input-type=module", "-e", probe]);
      break;
    } catch (error) {
      if (attempt === 19) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
} finally {
  docker(["rm", "-f", container]);
}
const dir = "test-results/portal-image";
mkdirSync(dir, { recursive: true });
const archive = "quasar-portal-image.tar.gz";
const child = spawn("docker", ["save", image], {
  stdio: ["ignore", "pipe", "inherit"],
});
const completed = new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0 ? resolve() : reject(Error("Image export failed")),
  );
});
await Promise.all([
  pipeline(child.stdout, createGzip(), createWriteStream(`${dir}/${archive}`)),
  completed,
]);
const hash = createHash("sha256");
for await (const chunk of createReadStream(`${dir}/${archive}`))
  hash.update(chunk);
writeFileSync(
  `${dir}/image-manifest.json`,
  JSON.stringify(
    {
      schemaVersion: 1,
      project: "quasar-portal",
      commit,
      image,
      imageId: info.Id,
      archive,
      archiveSha256: hash.digest("hex"),
      checkedAt: new Date().toISOString(),
      runtimeVerification: "passed",
      registryDigest: null,
      registryPublished: false,
      deployed: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Read-only UID1000 portal verified without network; exact image exported, no deployment.",
);
