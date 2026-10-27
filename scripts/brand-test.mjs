import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { unzipSync } from "fflate";
import { XMLValidator } from "fast-xml-parser";
const manifest = JSON.parse(
  await readFile("assets/brand/generated/manifest.json", "utf8"),
);
for (const a of manifest.assets) {
  const b = await readFile(a.file);
  assert.equal(createHash("sha256").update(b).digest("hex"), a.sha256, a.file);
  if (a.file.endsWith(".svg")) {
    const s = b.toString();
    assert.equal(XMLValidator.validate(s), true, a.file);
    assert.ok(!/<(?:image|text|filter)\b/i.test(s), a.file);
    if (!a.file.includes("wordmark")) assert.match(s, /id="prism-band"/);
    assert.ok(!/core-circle|id="blades"|id="star"|linearGradient/.test(s));
  }
  if (/\.(png|jpg)$/.test(a.file)) {
    const m = await sharp(b).metadata();
    assert.equal(m.width, a.width);
    assert.equal(m.height, a.height);
    assert.equal(m.hasAlpha, a.alpha);
    if (
      a.file.includes("generated") &&
      !/favicon|icon-|touch|\.jpg/.test(a.file)
    ) {
      const { data } = await sharp(b)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(data[3], 0, "Logo doit être transparent en bordure");
    }
  }
}
const ico = await readFile("build/icons/quasar.ico");
assert.equal(ico.readUInt16LE(2), 1);
assert.equal(ico.readUInt16LE(4), 6);
for (let i = 0; i < 6; i++) {
  const p = 6 + i * 16,
    n = ico[p] || 256,
    size = ico.readUInt32LE(p + 8),
    offset = ico.readUInt32LE(p + 12);
  const m = await sharp(ico.subarray(offset, offset + size)).metadata();
  assert.equal(m.width, n);
  assert.equal(m.height, n);
}
const icns = await readFile("build/icons/quasar.icns");
assert.equal(icns.toString("ascii", 0, 4), "icns");
assert.equal(icns.readUInt32BE(4), icns.length);
let p = 8,
  count = 0;
while (p < icns.length) {
  const size = icns.readUInt32BE(p + 4);
  assert.ok(size > 8);
  const m = await sharp(icns.subarray(p + 8, p + size)).metadata();
  assert.equal(m.width, [16, 32, 64, 128, 256, 512, 1024][count++]);
  p += size;
}
assert.equal(count, 7);
for (const n of [16, 24, 32, 48, 128, 512]) {
  const { data, info } = await sharp(`build/icons/icon-${n}.png`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const center = ((n / 2) * n + n / 2) * 4;
  assert.ok(
    data[center] > 230 && data[center + 1] > 230 && data[center + 2] > 230,
    "Ouverture du Q sur fond clair " + n,
  );
  assert.equal(info.width, n);
}
const launcher = await readFile("scripts/create-launcher.mjs", "utf8");
assert.match(launcher, /CFBundleIconFile: "quasar.icns"/);
assert.match(launcher, /Resources\/quasar.icns/);
assert.match(launcher, /fr.sezaam.camera-tool/);

// Every integration must contain exactly the exported variant.
for (const theme of ["light", "dark"]) {
  assert.deepEqual(
    await readFile(`src/renderer/assets/brand/horizontal-${theme}.svg`),
    await readFile(`assets/brand/generated/horizontal-${theme}.svg`),
  );
}
assert.deepEqual(
  await readFile("src/renderer/public/favicon.svg"),
  await readFile("assets/brand/generated/favicon.svg"),
);
const prism = await sharp("assets/brand/generated/symbol-light.svg")
  .ensureAlpha()
  .raw()
  .toBuffer();
const pixel = (x, y) => [
  ...prism.subarray((y * 128 + x) * 4, (y * 128 + x) * 4 + 4),
];
assert.deepEqual(pixel(60, 60), [0, 0, 0, 0], "Centre transparent");
assert.equal(pixel(100, 100)[3], 255, "Queue détachée visible");
assert.equal(pixel(106, 82)[3], 0, "Découpe diagonale entre ruban et queue");
assert.deepEqual(pixel(60, 15), [214, 0, 168, 255], "Magenta Prisme");
const archive = unzipSync(await readFile("assets/brand/quasar-prisme-kit.zip"));
for (const asset of manifest.assets)
  assert.deepEqual(
    Buffer.from(archive[asset.file]),
    await readFile(asset.file),
    `Kit ZIP : ${asset.file}`,
  );
for (const kind of [
  "symbol",
  "wordmark",
  "horizontal",
  "compact",
  "vertical",
]) {
  for (const variant of ["light", "dark", "mono-black", "mono-white"]) {
    for (const width of [128, 256, 512, 1024, 2048]) {
      for (const extension of ["png", "jpg"]) {
        const file = `assets/brand/generated/${kind}-${variant}-${width}.${extension}`;
        assert.ok(
          manifest.assets.some((asset) => asset.file === file),
          `Déclinaison absente : ${file}`,
        );
      }
    }
  }
}
console.log(
  `${manifest.assets.length} assets vérifiés : intégrité, formats, dimensions, transparence, ouverture Prisme, ICO/ICNS et packaging.`,
);
