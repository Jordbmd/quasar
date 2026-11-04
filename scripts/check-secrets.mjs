import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Inspect tracked and newly added sources, never ignored camera data or artifacts.
const files = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean),
  ),
];
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];
const failures = [];
for (const file of files) {
  if (
    /(^|\/)\.env(?!\.example$)|camera-login\.enc$|\.(?:p12|pfx|pem|key)$|(?:^|\/)(?:\.runtime|release|test-results)\//.test(
      file,
    )
  )
    failures.push(file);
  const data = readFileSync(file);
  if (
    !data.includes(0) &&
    patterns.some((pattern) => pattern.test(data.toString("utf8")))
  )
    failures.push(file);
}
if (failures.length) {
  // Names only: never print the matching contents.
  console.error(
    "Potential secrets/private files:",
    [...new Set(failures)].join(", "),
  );
  process.exitCode = 1;
} else
  console.log(
    "Source secret scan passed (patterns and private paths, not a security certification).",
  );
