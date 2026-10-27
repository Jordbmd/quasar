import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import * as fontkit from "fontkit";
import assert from "node:assert/strict";
import { zipSync } from "fflate";
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
assert.match(master, /id="prism-band"/);
assert.match(master, /id="prism-tail"/);
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
  // Prisme pairs the angular symbol with a round Q and a diagonal foot.
  if (i === 0) paths.push('<path d="M450 100 H650 L870 -105 H625 Z"/>');
  x += pos.xAdvance;
}
const scale = 88 / font.unitsPerEm,
  wordWidth = x * scale;
const word = (ink) =>
  `<g fill="${ink}" transform="translate(0 88) scale(${scale} ${-scale})">${paths.join("")}</g>`;
const ww = Math.ceil(wordWidth),
  horizontalWidth = 164 + ww;
const symbol = (ink, mono = false) =>
  inner(master)
    .replaceAll("#D600A8", mono ? ink : "#D600A8")
    .replaceAll("#BC0094", mono ? ink : "#BC0094");
const compositions = (ink, mono = false) => ({
  symbol: [128, 128, symbol(ink, mono)],
  wordmark: [ww, 108, word(ink)],
  horizontal: [
    horizontalWidth,
    160,
    `<g transform="translate(16 16)">${symbol(ink, mono)}</g><g transform="translate(164 24)">${word(ink)}</g>`,
  ],
  compact: [
    224,
    208,
    `<g transform="translate(64 8) scale(.75)">${symbol(ink, mono)}</g><g transform="translate(16 110) scale(${192 / ww})">${word(ink)}</g>`,
  ],
  vertical: [
    320,
    320,
    `<g transform="translate(96 24)">${symbol(ink, mono)}</g><g transform="translate(24 181) scale(${272 / ww})">${word(ink)}</g>`,
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
  for (const width of [128, 256, 512, 1024, 2048]) {
    const file = `${out}/${name}-${width}.png`;
    await sharp(Buffer.from(svg)).resize({ width }).png().toFile(file);
    const m = await sharp(file).metadata();
    assert.equal(m.width, width);
    assert.equal(m.height, Math.round((h * width) / w));
    assert.equal(m.hasAlpha, true);
    await record(file, usage);
  }
  assert.ok(jpegBg, `Fond JPEG requis pour ${name}`);
  for (const width of [128, 256, 512, 1024, 2048]) {
    const file = `${out}/${name}-${width}.jpg`;
    await sharp(Buffer.from(svg))
      .resize({ width })
      .flatten({ background: jpegBg })
      .jpeg({ quality: 95 })
      .toFile(file);
    await record(file, usage + " — fond uni " + jpegBg);
  }
}
for (const [theme, ink, bg] of [
  ["light", "#0A0F28", "#FAF9FD"],
  ["dark", "#FFFFFF", "#0A0F28"],
]) {
  const c = compositions(ink);
  for (const [name, [w, h, body]] of Object.entries(c)) {
    await svgExport(
      `${name}-${theme}`,
      w,
      h,
      body,
      `${name} sur fond ${theme}`,
      bg,
    );
    if (theme === "light" && name !== "symbol")
      await writeFile(`${source}/${name}.svg`, wrap(w, h, body));
  }
}
for (const [name, ink] of [
  ["black", "#000000"],
  ["white", "#FFFFFF"],
]) {
  const c = compositions(ink, true);
  for (const kind of Object.keys(c)) {
    const [w, h, b] = c[kind];
    await svgExport(
      `${kind}-mono-${name}`,
      w,
      h,
      b,
      "Prisme monochrome, ouverture transparente",
      name === "white" ? "#0A0F28" : "#FAF9FD",
    );
  }
}
const appIcon = (background, mono = false) =>
  wrap(
    1024,
    1024,
    `<rect x="32" y="32" width="960" height="960" rx="216" fill="${background}"/><g transform="translate(176 176) scale(5.25)">${symbol("#FFFFFF", mono)}</g>`,
  );
const app = appIcon("#FAF9FD");
for (const [name, bg, mono] of [
  ["dark", "#0A0F28", false],
  ["light", "#FAF9FD", false],
  ["mono", "#0A0F28", true],
]) {
  await svgExport(
    `app-icon-${name}`,
    1024,
    1024,
    inner(appIcon(bg, mono)),
    `Icône Prisme ${name}`,
    bg,
  );
}
await writeFile(`${source}/app-icon.svg`, app);
await writeFile(`${icons}/app-icon.svg`, app);
await record(`${icons}/app-icon.svg`, "Icône desktop, fond clair uni");
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
        "Prisme — proposition 02 choisie le 27 octobre 2026, reconstruite en tracés vectoriels éditables",
      font: "Sora 800, OFL, tracés via fontkit ; Q rond à pied diagonal, sans point final",
      source: "assets/brand/source/symbol.svg",
      transparentLogos: true,
      assets: entries,
    },
    null,
    2,
  ) + "\n",
);
// Review sheet is vector too: the symbols shown are the exact shipped paths.
const boardParts = [];
for (const [index, theme] of ["light", "dark"].entries()) {
  const y = index * 360;
  const background = theme === "dark" ? "#0A0F28" : "#FAF9FD";
  boardParts.push(
    `<rect y="${y}" width="1200" height="360" fill="${background}"/>`,
  );
  boardParts.push(
    `<g transform="translate(30 ${y + 28}) scale(${570 / horizontalWidth})">${inner(await readFile(`${out}/horizontal-${theme}.svg`, "utf8"))}</g>`,
  );
  for (const [i, n] of [16, 24, 32, 48, 128].entries()) {
    boardParts.push(
      `<g transform="translate(${40 + i * 110} ${y + 220}) scale(${n / 128})">${symbol("#D600A8")}</g>`,
    );
  }
  boardParts.push(
    `<g transform="translate(880 ${y + 40}) scale(.25)">${inner(appIcon(background))}</g>`,
  );
}
for (const [index, ink, bg] of [
  [0, "#000000", "#FAF9FD"],
  [1, "#FFFFFF", "#0A0F28"],
]) {
  const x = index * 600;
  boardParts.push(
    `<rect x="${x}" y="720" width="600" height="260" fill="${bg}"/>`,
  );
  boardParts.push(
    `<g transform="translate(${x + 30} 740) scale(${500 / horizontalWidth})">${compositions(ink, true).horizontal[2]}</g>`,
  );
  boardParts.push(
    `<g transform="translate(${x + 30} 910) scale(.3)">${symbol(ink, true)}</g>`,
  );
}
const board = wrap(1200, 980, boardParts.join("").replace(/ id="[^"]+"/g, ""));
await writeFile(`${out}/review-board.svg`, board);
await sharp(Buffer.from(board)).png().toFile(`${out}/review-board.png`);
await sharp(Buffer.from(board))
  .flatten({ background: "#FAF9FD" })
  .jpeg({ quality: 95 })
  .toFile(`${out}/review-board.jpg`);
const kit = {};
for (const { file } of entries) kit[file] = await readFile(file);
for (const name of [
  "symbol",
  "horizontal",
  "vertical",
  "compact",
  "wordmark",
  "app-icon",
]) {
  const file = `${source}/${name}.svg`;
  kit[file] = await readFile(file);
}
for (const name of [
  "manifest.json",
  "review-board.svg",
  "review-board.png",
  "review-board.jpg",
])
  kit[`${out}/${name}`] = await readFile(`${out}/${name}`);
kit["LICENSE-Sora.txt"] = await readFile("assets/fonts/Sora-OFL.txt");
kit["LIRE-MOI.txt"] = Buffer.from(`QUASAR — PRISME
Proposition 02 validée le 27 octobre 2026.

SVG éditables et exports en tracés, sans police à installer.
PNG transparents et JPEG sur fond uni : 128, 256, 512, 1024 et 2048 pixels de large.
Compositions : symbole, mot seul, horizontale, compacte et verticale.
Couleurs : magenta sur fond clair ou sombre, monochromes noir/blanc.
Icônes : variantes claire/sombre/monochrome, ICNS macOS, ICO Windows, PNG Linux et favicons.

Conserver les proportions et la découpe diagonale. Minimum conseillé : symbole 24 px ; favicon 16 px sans lettrage.
Les JPEG n'ont pas de transparence. Choisir PNG ou SVG pour superposer un logo.
Les noms light/dark indiquent le fond d'utilisation.
Source géométrique : assets/brand/source/symbol.svg.
Reconstruction vectorielle de la référence validée ; logotype dérivé de Sora 800 sous SIL OFL (licence jointe).
`);
await writeFile(
  "assets/brand/quasar-prisme-kit.zip",
  zipSync(
    Object.fromEntries(
      Object.entries(kit).map(([name, data]) => [
        name,
        [data, { mtime: new Date("2026-10-27T00:00:00Z") }],
      ]),
    ),
  ),
);
console.log(
  `${entries.length} assets Quasar Prisme générés, planche SVG/PNG/JPEG et kit ZIP prêts.`,
);
