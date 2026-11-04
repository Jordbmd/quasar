// Generated rules; version=2.0.0; source=Jordbmd/doublemart-platform@3512cd37201c3fd2dec7ab864c7acccb24ce2ea5:scripts/rules/verify-export.mjs
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export const filename = (value) =>
  typeof value === "string" && /^[a-z][a-z0-9-]*\.(?:md|mjs)$/.test(value);
export function header(manifest, name, sourcePath) {
  const text = `Generated rules; version=${manifest.version}; source=${manifest.source.repository}@${manifest.source.commit}:${sourcePath}`;
  return name.endsWith(".md") ? `<!-- ${text} -->` : `// ${text}`;
}

export function validateManifest(manifest) {
  if (
    manifest?.schemaVersion !== 1 ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version || "") ||
    manifest.source?.repository !== "Jordbmd/doublemart-platform" ||
    !/^[a-f0-9]{40}$/.test(manifest.source?.commit || "") ||
    !["node-web", "python-web", "electron"].includes(manifest.profile) ||
    !manifest.files ||
    !manifest.files["core.md"] ||
    !manifest.files["verify.mjs"]
  ) {
    throw new Error("Invalid rules manifest or declared version/source.");
  }
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (
      !filename(name) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256 || "") ||
      !(
        entry.source === `docs/standards/${name}` ||
        (name === "verify.mjs" &&
          entry.source === "scripts/rules/verify-export.mjs")
      )
    ) {
      throw new Error(`Invalid managed rules entry: ${name}`);
    }
  }
  return manifest;
}

export function verifyExport(
  directory = path.dirname(fileURLToPath(import.meta.url)),
) {
  if (fs.lstatSync(directory).isSymbolicLink())
    throw new Error("Rules directory must not be a symlink.");
  const manifestPath = path.join(directory, "manifest.json");
  if (fs.lstatSync(manifestPath).isSymbolicLink())
    throw new Error("Rules manifest must not be a symlink.");
  const manifest = validateManifest(
    JSON.parse(fs.readFileSync(manifestPath, "utf8")),
  );
  const allowed = new Set(["manifest.json", ...Object.keys(manifest.files)]);
  for (const entry of fs.readdirSync(directory)) {
    if (!allowed.has(entry))
      throw new Error(`Unmanaged file inside generated rules: ${entry}`);
  }
  for (const [name, expected] of Object.entries(manifest.files)) {
    const file = path.join(directory, name);
    if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())
      throw new Error(`Not a regular rules file: ${name}`);
    const content = fs.readFileSync(file);
    if (
      sha256(content) !== expected.sha256 ||
      content.toString("utf8").split("\n")[0] !==
        header(manifest, name, expected.source)
    ) {
      throw new Error(`Generated rules changed or inconsistent: ${name}`);
    }
  }
  return {
    version: manifest.version,
    profile: manifest.profile,
    source: manifest.source,
    files: Object.keys(manifest.files).length,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = verifyExport();
    console.log(
      JSON.stringify({
        status: "locally-consistent",
        ...result,
        scope:
          "Offline integrity only; latest canonical source is not queried.",
      }),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
