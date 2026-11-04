import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Narrow, dated triage of the Debian packages actually shipped on 2026-11-04.
// No wildcard, no application dependency exception, no blanket --ignore-unfixed.
const reviewed = {
  "CVE-2023-45853": ["zlib1g"],
  "CVE-2025-69720": ["libtinfo6", "ncurses-base", "ncurses-bin"],
  "CVE-2026-16742": ["libsystemd0", "libudev1"],
  "CVE-2026-41992": ["gzip"],
  "CVE-2026-53613": [
    "bsdutils",
    "libblkid1",
    "libmount1",
    "libsmartcols1",
    "libuuid1",
    "mount",
    "util-linux",
    "util-linux-extra",
  ],
  "CVE-2026-53615": [
    "bsdutils",
    "libblkid1",
    "libmount1",
    "libsmartcols1",
    "libuuid1",
    "mount",
    "util-linux",
    "util-linux-extra",
  ],
  "CVE-2026-54369": ["libacl1"],
  "CVE-2026-78410": [
    "bsdutils",
    "libblkid1",
    "libmount1",
    "libsmartcols1",
    "libuuid1",
    "mount",
    "util-linux",
    "util-linux-extra",
  ],
  "CVE-2026-9538": ["perl-base"],
};
export function evaluateImageAudit(report, now = new Date()) {
  if (
    report.SchemaVersion !== 2 ||
    !Array.isArray(report.Results) ||
    !report.Results.length
  )
    throw Error("Missing or unsupported image audit");
  const blocked = [],
    accepted = [];
  for (const result of report.Results) {
    for (const item of result.Vulnerabilities ?? []) {
      if (!["HIGH", "CRITICAL"].includes(item.Severity)) continue;
      const exception =
        result.Class === "os-pkgs" &&
        result.Type === "debian" &&
        !item.FixedVersion &&
        reviewed[item.VulnerabilityID]?.includes(item.PkgName) &&
        now < new Date("2026-12-05T00:00:00Z");
      (exception ? accepted : blocked).push({
        id: item.VulnerabilityID,
        package: item.PkgName,
        severity: item.Severity,
      });
    }
  }
  return {
    blocked,
    reviewedUnfixed: accepted,
    reviewExpires: "2026-12-05",
    fullReportRetained: true,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = evaluateImageAudit(
    JSON.parse(readFileSync(process.argv[2], "utf8")),
  );
  console.log(JSON.stringify(result));
  if (result.blocked.length)
    throw Error("Unreviewed high/critical image advisory; promotion blocked");
}
