import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import * as fontkit from "fontkit";
import assert from "node:assert/strict";
const source = "assets/brand/source",
  out = "assets/brand/generated",
  icons = "build/icons";
for (const d of [
  out,
  icons,
  "src/renderer/assets/brand",
  "src/renderer/public",
])
  await mkdir(d, { recursive: true });
const master = await readFile(`${source}/symbol.svg`, "utf8");
assert.match(master, /<circle id="core-circle"/);
assert.ok(!/<image|<filter|<text\b/i.test(master));
const inner = (s) =>
  s.replace(/^.*?<svg[^>]*>/s, "").replace(/<\/svg>\s*$/, "");
const wrap = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const font = fontkit
  .openSync("assets/fonts/Sora-Variable.ttf")
  .getVariation({ wght: 800 });
const run = font.layout("Quasar");
let x = 0;
const paths = [];
for (let i = 0; i < run.glyphs.length; i++) {
  const pos = run.positions[i];
  paths.push(
    `<path transform="translate(${x + pos.xOffset} ${-pos.yOffset})" d="${(i === 0 ? font.glyphForCodePoint(79) : run.glyphs[i]).path.toSVG()}"/>`,
  );
  // Reference Q has a diagonal tail, unlike Sora's descending hooked Q.
  // Use Sora's matching O contour with an explicit reproducible diagonal tail.
  if(i===0) paths.push('<path d="M440 240 L570 340 L850 32 L730 -75 Z"/>');
  x += pos.xAdvance;
}
const scale = 88 / font.unitsPerEm,
  wordWidth = x * scale;
const word = (ink, dot) =>
  `<g fill="${ink}" transform="translate(0 88) scale(${scale} ${-scale})">${paths.join("")}</g><circle cx="${wordWidth + 11}" cy="81" r="7" fill="${dot}"/>`;
const sw = 128,
  ww = Math.ceil(wordWidth + 27),
  horizontalWidth = 164 + ww;
const symbol = (ink, mono = false) => {
  let s = inner(master).replaceAll("#0A0F28", ink);
  if (mono)
    s = s
      .replace('fill="url(#core)"', `fill="${ink}" mask="url(#hole)"`)
      .replace(/<circle id="core-circle"[^>]+\/>/, "")
      .replace(
        "</defs>",
        '<mask id="hole"><rect width="128" height="128" fill="white"/><circle id="core-circle" cx="64" cy="64" r="7" fill="black"/></mask></defs>',
      );
  return s;
};
const compositions = (ink, dot, mono = false) => ({
  symbol: [128, 128, symbol(ink, mono)],
  wordmark: [ww, 108, word(ink, dot)],
  horizontal: [
    horizontalWidth,
    160,
    `<g transform="translate(16 16)">${symbol(ink, mono)}</g><g transform="translate(164 24)">${word(ink, dot)}</g>`,
  ],
  compact: [
    224,
    208,
    `<g transform="translate(64 8) scale(.75)">${symbol(ink, mono)}</g><g transform="translate(16 110) scale(${192 / ww})">${word(ink, dot)}</g>`,
  ],
  vertical: [
    320,
    320,
    `<g transform="translate(96 24)">${symbol(ink, mono)}</g><g transform="translate(24 181) scale(${272 / ww})">${word(ink, dot)}</g>`,
  ],
});
const entries = [];
async function record(file, usage) {
  const data = await readFile(file);
  const svg = file.endsWith(".svg");
  const meta = svg
    ? await sharp(data).metadata()
    : /\.(png|jpg)$/.test(file)
      ? await sharp(data).metadata()
      : {};
  entries.push({
    file,
    usage,
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
    width: meta.width,
    height: meta.height,
    format: meta.format || path.extname(file).slice(1),
    alpha: meta.hasAlpha,
  });
}
async function svgExport(name, w, h, body, usage, jpegBg) {
  const svg = wrap(w, h, body);
  assert.ok(!/<image|<filter|<text\b/i.test(svg));
  await writeFile(`${out}/${name}.svg`, svg);
  await record(`${out}/${name}.svg`, usage);
  for (const width of [128, 256, 512, 1024]) {
    const file = `${out}/${name}-${width}.png`;
    await sharp(Buffer.from(svg)).resize({ width }).png().toFile(file);
    const m = await sharp(file).metadata();
    assert.equal(m.width, width);
    assert.equal(m.height, Math.round((h * width) / w));
    assert.equal(m.hasAlpha, true);
    await record(file, usage);
  }
  if (jpegBg) {
    const file = `${out}/${name}-1024.jpg`;
    await sharp(Buffer.from(svg))
      .resize({ width: 1024 })
      .flatten({ background: jpegBg })
      .jpeg({ quality: 95 })
      .toFile(file);
    await record(file, usage + " — fond uni");
  }
}
for (const [theme, ink, bg] of [
  ["light", "#0A0F28", "#FAF9FD"],
  ["dark", "#FFFFFF", "#0A0F28"],
]) {
  const c = compositions(ink, "#D600A8");
  for (const [name, [w, h, body]] of Object.entries(c)) {
    await svgExport(
      `${name}-${theme}`,
      w,
      h,
      body,
      `${name} sur fond ${theme}`,
      ["horizontal", "compact", "vertical"].includes(name) ? bg : undefined,
    );
    if (theme === "light" && name !== "symbol")
      await writeFile(`${source}/${name}.svg`, wrap(w, h, body));
  }
}
for (const [name, ink] of [
  ["black", "#000000"],
  ["white", "#FFFFFF"],
]) {
  const c = compositions(ink, ink, true);
  for (const kind of ["symbol", "horizontal"]) {
    const [w, h, b] = c[kind];
    await svgExport(
      `${kind}-mono-${name}`,
      w,
      h,
      b,
      "Monochrome, centre en réserve",
    );
  }
}
const app = wrap(
  1024,
  1024,
  `<rect x="32" y="32" width="960" height="960" rx="216" fill="#0A0F28"/><g transform="translate(176 176) scale(5.25)">${symbol("#FFFFFF")}</g>`,
);
await writeFile(`${source}/app-icon.svg`, app);
await writeFile(`${icons}/app-icon.svg`, app);
await record(`${icons}/app-icon.svg`, "Icône desktop, fond bleu nuit uni");
const pngs = new Map();
for (const n of [16, 24, 32, 48, 64, 128, 180, 192, 256, 512, 1024]) {
  const data = await sharp(Buffer.from(app)).resize(n, n).png().toBuffer();
  pngs.set(n, data);
  const file = `${icons}/icon-${n}.png`;
  await writeFile(file, data);
  await record(file, "Icône application / Linux");
}
// ICO accepts PNG payloads; each directory entry retains the exact pixel size.
const icoSizes = [16, 32, 48, 64, 128, 256];
const header = Buffer.alloc(6 + 16 * icoSizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = header.length;
icoSizes.forEach((n, i) => {
  let p = 6 + i * 16,
    b = pngs.get(n);
  header[p] = n === 256 ? 0 : n;
  header[p + 1] = n === 256 ? 0 : n;
  header.writeUInt16LE(1, p + 4);
  header.writeUInt16LE(32, p + 6);
  header.writeUInt32LE(b.length, p + 8);
  header.writeUInt32LE(offset, p + 12);
  offset += b.length;
});
await writeFile(
  `${icons}/quasar.ico`,
  Buffer.concat([header, ...icoSizes.map((n) => pngs.get(n))]),
);
await record(`${icons}/quasar.ico`, "Windows / favicon multi-résolution");
const chunks = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
].map(([type, n]) => {
  const b = pngs.get(n),
    h = Buffer.alloc(8);
  h.write(type);
  h.writeUInt32BE(b.length + 8, 4);
  return Buffer.concat([h, b]);
});
const ih = Buffer.alloc(8);
ih.write("icns");
ih.writeUInt32BE(8 + chunks.reduce((s, b) => s + b.length, 0), 4);
await writeFile(`${icons}/quasar.icns`, Buffer.concat([ih, ...chunks]));
await record(`${icons}/quasar.icns`, "Icône macOS");
await writeFile(`${out}/favicon.svg`, app);
await record(`${out}/favicon.svg`, "Favicon vectoriel");
await copyFile(`${icons}/quasar.ico`, `${out}/favicon.ico`);
await record(`${out}/favicon.ico`, "Favicon multi-résolution");
for (const [name, n] of [
  ["favicon-16x16", 16],
  ["favicon-32x32", 32],
  ["favicon-48x48", 48],
  ["apple-touch-icon", 180],
  ["icon-192", 192],
  ["icon-512", 512],
]) {
  await writeFile(`${out}/${name}.png`, pngs.get(n));
  await record(`${out}/${name}.png`, "Icône web");
}
// Only two small SVGs and the favicon enter the renderer build.
for (const theme of ["dark", "light"])
  await copyFile(
    `${out}/horizontal-${theme}.svg`,
    `src/renderer/assets/brand/horizontal-${theme}.svg`,
  );
await copyFile(`${out}/favicon.svg`, "src/renderer/public/favicon.svg");
await writeFile(
  `${out}/manifest.json`,
  JSON.stringify(
    {
      brand: "Quasar",
      provenance:
        "Reconstruction vectorielle de la planche fournie, pas un master original",
      font: "Sora 800, OFL, tracés via fontkit ; Q à queue diagonale reconstruit",
      source: "assets/brand/source/symbol.svg",
      transparentLogos: true,
      assets: entries,
    },
    null,
    2,
  ) + "\n",
);
const tiles = [];
let y = 0;
for (const theme of ["dark", "light"]) {
  tiles.push({
    input: await sharp({
      create: {
        width: 1200,
        height: 360,
        channels: 4,
        background: theme === "dark" ? "#0A0F28" : "#FAF9FD",
      },
    })
      .png()
      .toBuffer(),
    top: y,
    left: 0,
  });
  tiles.push({
    input: await sharp(`${out}/horizontal-${theme}.svg`)
      .resize({ width: 570 })
      .png()
      .toBuffer(),
    top: y + 28,
    left: 30,
  });
  for (const [i, n] of [16, 24, 32, 48, 128].entries())
    tiles.push({
      input: await sharp(`${out}/symbol-${theme}.svg`)
        .resize(n, n)
        .png()
        .toBuffer(),
      top: y + 220,
      left: 40 + i * 110,
    });
  tiles.push({ input: pngs.get(256), top: y + 40, left: 880 });
  y += 360;
}
await sharp({
  create: { width: 1200, height: 720, channels: 4, background: "#FAF9FD" },
})
  .composite(tiles)
  .png()
  .toFile(`${out}/review-board.png`);
console.log(`${entries.length} assets Quasar générés et dimensions vérifiées.`);
