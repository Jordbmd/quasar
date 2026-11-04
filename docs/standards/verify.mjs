// Generated rules; version=3.0.1; source=Jordbmd/doublemart-platform@3bda38909cf8f9c7b3a406ce791fa4543d988e2d:scripts/rules/verify-export.mjs
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const commonFiles = [
  "core.md",
  "architecture.md",
  "security.md",
  "ui-ux.md",
  "testing.md",
  "observability.md",
  "delivery.md",
  "verify.mjs",
];
const profileFiles = {
  "node-web": "node-web.md",
  "python-web": "python-web.md",
  electron: "electron.md",
};

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
      ![...commonFiles, profileFiles[manifest.profile]].includes(name) ||
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
  if (
    [...commonFiles, profileFiles[manifest.profile]].some(
      (name) => !manifest.files[name],
    )
  )
    throw new Error("Missing public profile rules.");
  return manifest;
}

export function verifyFiles(files) {
  const manifest = validateManifest(JSON.parse(files["manifest.json"]));
  if (
    Object.keys(files).some(
      (name) => name !== "manifest.json" && !manifest.files[name],
    )
  )
    throw new Error("Unmanaged file inside generated rules.");
  for (const [name, entry] of Object.entries(manifest.files)) {
    const content = files[name];
    if (
      typeof content !== "string" ||
      sha256(content) !== entry.sha256 ||
      !content.startsWith(header(manifest, name, entry.source) + "\n")
    )
      throw new Error(`Generated rules changed or inconsistent: ${name}`);
    if (
      /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|[A-Z]:[\\/]Users[\\/]/i.test(
        content,
      )
    )
      throw new Error("Private credential or personal path in public export.");
    if (name.endsWith(".md"))
      for (const match of content.matchAll(/\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g)) {
        if (!match[1].includes(":") && !Object.hasOwn(files, match[1]))
          throw new Error(`Unresolved local rules reference: ${name}`);
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
  verifyFiles(
    Object.fromEntries(
      [...allowed].map((name) => [
        name,
        fs.readFileSync(path.join(directory, name), "utf8"),
      ]),
    ),
  );
  return {
    version: manifest.version,
    profile: manifest.profile,
    source: manifest.source,
    files: Object.keys(manifest.files).length,
  };
}

// Executed from the BASE revision by CI. No dependency install and no PR code
// execution are needed to classify an untrusted change. Ambiguity fails closed.
export function classifyChange({
  files,
  readBefore,
  readAfter,
  canonical = false,
}) {
  if (!files.length) return "docs";
  if (
    files.some(
      (file) =>
        !file.path ||
        file.status === "R" ||
        file.status === "C" ||
        (file.mode && file.mode !== "100644"),
    )
  )
    return "application";
  const names = files.map((file) => file.path);
  const publicRules = new Set([
    ...commonFiles.filter((n) => n.endsWith(".md")),
    ...Object.values(profileFiles),
  ]);
  if (names.every((name) => name.startsWith("docs/standards/"))) {
    if (canonical) {
      if (
        names.every(
          (name) =>
            publicRules.has(name.slice(15)) ||
            name === "docs/standards/release.json" ||
            name === "docs/standards/platform-operations.md",
        )
      )
        return "rules";
    } else {
      const previousFiles = readBefore(),
        nextFiles = readAfter();
      const before = verifyFiles(previousFiles),
        after = verifyFiles(nextFiles);
      if (before.profile !== after.profile)
        throw new Error("Rules profile changed.");
      const oldScript = previousFiles["verify.mjs"]
        .split("\n")
        .slice(1)
        .join("\n");
      const newScript = nextFiles["verify.mjs"].split("\n").slice(1).join("\n");
      if (oldScript === newScript) return "rules";
      return "application"; // A generated executable is tooling, not documentation.
    }
  }
  if (
    names.every((name) =>
      /^(?:docs\/.*\.(?:md|json)|(?:AGENTS|README|CHANGELOG)\.md)$/.test(name),
    )
  )
    return "docs";
  if (
    canonical &&
    names.every((name) =>
      /^(?:docs\/|scripts\/(?:rules|ci-scope)|tests\/(?:rules|ci-scope)|\.github\/workflows\/|rules-workspace\.example\.json)/.test(
        name,
      ),
    )
  )
    return "tooling";
  return "application";
}

export function runCi(
  env = process.env,
  git = (args) =>
    execFileSync("git", args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }),
) {
  const base = env.CI_BASE,
    head = env.CI_HEAD;
  let mode = "application";
  if (
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" &&
    /^[a-f0-9]{40}$/.test(base || "") &&
    !/^0+$/.test(base) &&
    /^[a-f0-9]{40}$/.test(head || "")
  ) {
    const changes = git([
      "diff",
      "--no-renames",
      "--name-status",
      "-z",
      base,
      head,
    ])
      .split("\0")
      .filter(Boolean);
    const files = [];
    for (let i = 0; i < changes.length; i += 2)
      files.push({ status: changes[i], path: changes[i + 1] });
    const readAt = (ref) => {
      const tree = git(["ls-tree", "-r", "-z", ref, "--", "docs/standards/"])
        .split("\0")
        .filter(Boolean);
      const data = {};
      for (const item of tree) {
        const [meta, name] = item.split("\t");
        if (!meta.startsWith("100644 blob "))
          throw new Error("Non-regular generated entry.");
        data[name.slice(15)] = git(["show", `${ref}:${name}`]);
      }
      return data;
    };
    const canonical = env.GITHUB_REPOSITORY === "Jordbmd/doublemart-platform";
    mode = classifyChange({
      files,
      readBefore: () => readAt(base),
      readAfter: () => readAt(head),
      canonical,
    });
    if (mode === "docs" || mode === "rules") {
      for (const file of files) {
        if (file.status === "D") continue;
        const entry = git(["ls-tree", head, "--", file.path]);
        if (!entry.startsWith("100644 blob "))
          throw new Error("Non-regular documentation change.");
        if (file.path.endsWith(".json"))
          JSON.parse(git(["show", `${head}:${file.path}`]));
      }
    }
  }
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `mode=${mode}\n`);
  console.log(
    JSON.stringify({
      mode,
      base,
      head,
      scope:
        "Actual Git diff; trusted base classifier; no author, label or message exemption.",
    }),
  );
  return mode;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.includes("--ci")) {
      runCi();
    } else {
      const result = verifyExport();
      console.log(
        JSON.stringify({
          status: "locally-consistent",
          ...result,
          scope:
            "Offline integrity only; latest canonical source is not queried.",
        }),
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
