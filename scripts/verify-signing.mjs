import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

/** Verify the produced artifact, rather than inferring signing from builder config. */
export async function verifySigning(installer, buildFolder, platform) {
  const checkedAt = new Date().toISOString();
  if (platform === "win32" && process.platform === "win32") {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1'); (Get-AuthenticodeSignature -LiteralPath $env:QUASAR_VERIFY_ARTIFACT).Status.ToString()",
      ],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 30000,
        env: { ...process.env, QUASAR_VERIFY_ARTIFACT: installer },
      },
    );
    const status = result.status === 0 ? result.stdout.trim() : "Unknown";
    if (!["Valid", "NotSigned"].includes(status))
      throw Error(
        "Installer Authenticode verification failed or is unavailable.",
      );
    return {
      mode: status === "Valid" ? "authenticode-verified" : "unsigned",
      installer: status,
      tool: "Get-AuthenticodeSignature",
      checkedAt,
    };
  }
  if (platform === "darwin" && process.platform === "darwin") {
    const candidates = [];
    for (const entry of await readdir(buildFolder, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("mac")) continue;
      for (const name of await readdir(path.join(buildFolder, entry.name)))
        if (name.endsWith(".app"))
          candidates.push(path.join(buildFolder, entry.name, name));
    }
    if (candidates.length !== 1)
      throw Error(
        "Expected exactly one application for signature verification.",
      );
    const verified = spawnSync(
      "codesign",
      ["--verify", "--deep", "--strict", candidates[0]],
      { encoding: "utf8", timeout: 30000 },
    );
    const details = spawnSync(
      "codesign",
      ["-d", "--verbose=4", candidates[0]],
      { encoding: "utf8", timeout: 30000 },
    );
    const unsigned = /not signed at all/i.test(details.stderr ?? "");
    if (!unsigned && (verified.status !== 0 || details.status !== 0))
      throw Error("Application code signature verification failed.");
    const diskImage = spawnSync("codesign", ["-d", "--verbose=4", installer], {
      encoding: "utf8",
      timeout: 30000,
    });
    const installerUnsigned = /not signed at all/i.test(diskImage.stderr ?? "");
    if (
      !installerUnsigned &&
      (diskImage.status !== 0 ||
        spawnSync("codesign", ["--verify", "--strict", installer], {
          timeout: 30000,
        }).status !== 0)
    )
      throw Error("Disk image signature verification failed.");
    return {
      mode: unsigned
        ? "unsigned"
        : /Signature=adhoc/.test(details.stderr)
          ? "ad-hoc-verified-not-notarized"
          : "signed-verified-notarization-not-checked",
      application: unsigned ? "NotSigned" : "Valid",
      installer: installerUnsigned ? "NotSigned" : "Valid",
      tool: "codesign --verify --deep --strict",
      checkedAt,
      notarization: "not-checked",
    };
  }
  if (platform === "linux" && process.platform === "linux") {
    const result = spawnSync("readelf", ["--hex-dump=.sha256_sig", installer], {
      encoding: "utf8",
      timeout: 30000,
    });
    if (result.status !== 0)
      throw Error("AppImage signature inspection unavailable.");
    const rows = [
      ...result.stdout.matchAll(
        /^\s*0x[0-9a-f]+\s+((?:[0-9a-f]{8}\s*){1,4})/gim,
      ),
    ];
    const absent = /does not exist/.test(result.stderr ?? "");
    const empty =
      rows.length > 0 && rows.every((row) => /^[0\s]+$/.test(row[1]));
    if (!absent && !empty)
      throw Error(
        "AppImage contains a signature requiring a configured trusted-key verifier.",
      );
    return {
      mode: "unsigned",
      installer: "No embedded signature",
      tool: "readelf --hex-dump=.sha256_sig",
      checkedAt,
    };
  }
  // No claim about a signature that this build host cannot verify.
  return {
    mode: "not-verified",
    tool: null,
    checkedAt,
    reason:
      platform === "linux"
        ? "No embedded AppImage signature verification configured"
        : "Native verifier unavailable on this build host",
  };
}
