import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const tokens = JSON.parse(
  await readFile("src/renderer/design-system/tokens.json", "utf8"),
);
const prefixed = (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => ["--" + k, v]));
const dark = prefixed(tokens.dark),
  light = prefixed(tokens.light);
function luminance(hex) {
  let s = hex.slice(1);
  if (s.length === 3) s = [...s].map((c) => c + c).join("");
  const v = [0, 2, 4]
    .map((i) => parseInt(s.slice(i, i + 2), 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function ratio(a, b) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const results = [];
for (const [theme, t] of Object.entries({ dark, light })) {
  for (const fg of [
    "--text",
    "--muted",
    "--subtle",
    "--accent-bright",
    "--success",
    "--danger",
    "--warning",
    "--info",
    "--unsupported",
    "--untested",
  ])
    for (const bg of [
      "--bg",
      "--sidebar",
      "--surface",
      "--surface-raised",
      "--input",
      "--selected",
    ])
      results.push({ theme, fg, bg, ratio: ratio(t[fg], t[bg]), minimum: 4.5 });
  results.push({
    theme,
    fg: "--accent-text",
    bg: "--accent",
    ratio: ratio(t["--accent-text"], t["--accent"]),
    minimum: 4.5,
  });
  for (const fg of ["--border", "--focus"])
    for (const bg of ["--surface", "--input"])
      results.push({ theme, fg, bg, ratio: ratio(t[fg], t[bg]), minimum: 3 });
}
await mkdir("test-results", { recursive: true });
await writeFile("test-results/contrast.json", JSON.stringify(results, null, 2));
const failures = results.filter((r) => r.ratio < r.minimum);
console.log(
  failures.length
    ? failures
    : `${results.length} contrôles de contraste réussis (textes AA et composants).`,
);
assert.equal(failures.length, 0, "Contrastes insuffisants");
