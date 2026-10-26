import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
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
    if (!a.file.includes("wordmark"))
      assert.match(s, /circle id="core-circle" cx="64" cy="64" r="7"/);
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
    data[center] > 180 && data[center + 1] > 110,
    "Cercle central visible " + n,
  );
  assert.equal(info.width, n);
}
const launcher = await readFile("scripts/create-launcher.mjs", "utf8");
assert.match(launcher, /CFBundleIconFile: "quasar.icns"/);
assert.match(launcher, /Resources\/quasar.icns/);
assert.match(launcher, /fr.sezaam.camera-tool/);
console.log(
  `${manifest.assets.length} assets vérifiés : intégrité, formats, dimensions, transparence, cercle central, ICO/ICNS et packaging.`,
);
