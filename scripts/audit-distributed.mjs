import { readFile, mkdir, writeFile } from "node:fs/promises";
import { version as relayVersion } from "./video-assets.mjs";
import { createHash } from "node:crypto";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const binary = await readFile(
  process.platform === "win32" ? "bin/go2rtc.exe" : "bin/go2rtc",
);
const index = binary.indexOf(Buffer.from("\xff Go buildinf:", "latin1"));
if (index < 0 || !(binary[index + 15] & 2))
  throw Error("Go build information format not supported; audit unavailable");
let offset = index + 32;
function text() {
  let length = 0,
    shift = 0,
    value;
  do {
    value = binary[offset++];
    length += (value & 127) * 2 ** shift;
    shift += 7;
    if (shift > 49) throw Error("Invalid build information");
  } while (value & 128);
  if (offset + length > binary.length)
    throw Error("Truncated build information");
  const result = binary.subarray(offset, offset + length).toString("utf8");
  offset += length;
  return result;
}
const go = text(),
  info = text();
const packages = [
  {
    package: { ecosystem: "npm", name: "electron" },
    version: pkg.devDependencies.electron,
  },
  {
    package: { ecosystem: "Go", name: "stdlib" },
    version: go.replace(/^go/, ""),
  },
  {
    package: { ecosystem: "Go", name: "github.com/AlexxIT/go2rtc" },
    version: relayVersion.replace(/^v/, ""),
  },
];
for (const match of info.matchAll(/\ndep\t([^\t\n]+)\t(v[^\t\n]+)\t/g))
  packages.push({
    package: { ecosystem: "Go", name: match[1] },
    version: match[2],
  });
const results = [];
for (const query of packages) {
  const found = [];
  let page;
  do {
    const response = await fetch("https://api.osv.dev/v1/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...query, ...(page ? { page_token: page } : {}) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error(`Advisory lookup failed: ${response.status}`);
    const result = await response.json();
    found.push(
      ...(result.vulns ?? []).map(
        ({ id, summary, aliases, affected, references }) => ({
          id,
          summary,
          aliases,
          affected,
          references,
        }),
      ),
    );
    page = result.next_page_token;
  } while (page);
  results.push({ ...query, advisories: found });
}
await mkdir("test-results", { recursive: true });
const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  source: "https://api.osv.dev",
  goRuntime: go,
  binarySha256: createHash("sha256").update(binary).digest("hex"),
  scope:
    "Electron npm version and modules extracted from the distributed go2rtc binary; version-based, not reachability analysis",
  results,
};
await writeFile(
  "test-results/distributed-audit.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    results.map((r) => ({
      name: r.package.name,
      version: r.version,
      advisories: r.advisories.map((a) => a.id),
    })),
    null,
    2,
  ),
);
if (results.some((result) => result.advisories.length)) {
  process.exitCode = 1;
}
