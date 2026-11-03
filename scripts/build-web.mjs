import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  cp,
  readdir,
  rm,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const workingTreeDirty = !!execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
}).trim();
const release = "https://github.com/Jordbmd/quasar/releases/tag/v0.2.0";
const repository = "https://github.com/Jordbmd/quasar";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function inventory(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(path.join(directory, prefix), {
    withFileTypes: true,
  })) {
    const file = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await inventory(directory, file)));
    else if (entry.isFile()) {
      const bytes = await readFile(path.join(directory, file));
      files.push({ file, bytes: bytes.length, sha256: sha256(bytes) });
    } else throw Error(`Unexpected output entry: ${file}`);
  }
  return files.sort((a, b) => a.file.localeCompare(b.file, "en"));
}
const content = {
  fr: {
    title: "Vos caméras. Votre réseau. Votre contrôle.",
    intro:
      "Quasar configure et diagnostique les caméras IP depuis votre ordinateur, sur une connexion Ethernet locale.",
    skip: "Aller au contenu",
    downloads: "Versions et téléchargements",
    docs: "Documentation",
    source: "Code source",
    language: "English",
    other: "en",
    theme: "Thème",
    system: "Système",
    light: "Clair",
    dark: "Sombre",
    eyebrow: "Application locale · macOS / Windows / Linux",
    release: "Consulter la version 0.2.0",
    local:
      "Aucun compte cloud requis. Les identifiants caméra restent dans la session locale.",
    computer: "Votre ordinateur · Quasar",
    ethernet: "Connexion Ethernet",
    camera: "Vos caméras IP",
    diagram: "Parcours de connexion locale",
    diagramNote:
      "La découverte et les écritures sont déclenchées depuis l’application. Aucun envoi de données caméra à une plateforme.",
    workflow: "Un changement, puis une vérification.",
    steps: [
      "Découvrir les caméras sur le réseau Ethernet et vérifier leur identité.",
      "Lire les capacités et préparer les réglages compatibles.",
      "Confirmer les actions sensibles, puis relire les résultats sur chaque caméra.",
    ],
    control: "Gardez la main sur vos réglages.",
    controlText:
      "Le profil Sezaam est embarqué. Vos profils locaux restent prioritaires ; les réglages ne sont pas appliqués aux caméras au démarrage.",
    read: "Lire le fonctionnement et les limites",
    versions: "Versions disponibles",
    versionText:
      "La version publique 0.2.0 existe sur GitHub. Les changements de préparation à la production de cette branche ne sont pas encore publiés dans une nouvelle version.",
    signing:
      "La version 0.2.0 possède une signature Mac locale sans notarisation. L’installateur Windows n’a pas de certificat de distribution. Consultez la provenance et les sommes SHA-256 avant installation.",
    download: "Téléchargements et empreintes",
    mac: "macOS · Apple Silicon",
    macInfo: "DMG pour arm64. Les Mac Intel nécessitent un autre paquet.",
    win: "Windows · x64",
    winInfo: "Installateur NSIS par utilisateur, sans élévation automatique.",
    linux: "Linux · x64",
    linuxInfo:
      "AppImage. Bureau graphique, FUSE, espaces de noms utilisateur et iproute2 requis.",
    prepared: "Fabrication préparée, validation distincte.",
    preparedText:
      "La CI est définie pour fabriquer sur chaque système natif. Un paquet produit ou un test logiciel réussi ne prouve ni l’installation sur votre poste ni la compatibilité avec un firmware caméra.",
    platformDocs: "Consulter la matrice des plateformes",
    sources: "Ressources du projet",
    technical: "Documentation technique",
    technicalText:
      "Architecture, limites matérielles, distribution et protocole de validation dans le dépôt public.",
    design: "Composants et identité",
    designText:
      "Le design utilise les composants Storybook de l’application, ses tokens et ses ressources locales. L’espace technique sera protégé à l’origine.",
    asset: "Espace technique (accès protégé)",
    footer: "Application locale. Aucune télémétrie caméra.",
    privacy:
      "Ce portail ne collecte aucune donnée et n’intègre aucun outil de suivi.",
    assetTitle: "Quasar · espace technique",
    assetIntro: "Identité et composants de l’application locale.",
    storybook: "Ouvrir Storybook",
    tokens: "Tokens du design",
    manifest: "Manifest de construction",
    assetNote:
      "Artefact statique destiné à asset.quasar.doublemart.fr. La protection doit être appliquée par le serveur d’origine avant exposition. Les fixtures Storybook sont simulées.",
    portal: "Portail public",
  },
  en: {
    title: "Your cameras. Your network. Your control.",
    intro:
      "Quasar configures and diagnoses IP cameras from your computer over a local Ethernet connection.",
    skip: "Skip to content",
    downloads: "Versions and downloads",
    docs: "Documentation",
    source: "Source code",
    language: "Français",
    other: "fr",
    theme: "Theme",
    system: "System",
    light: "Light",
    dark: "Dark",
    eyebrow: "Local application · macOS / Windows / Linux",
    release: "View version 0.2.0",
    local:
      "No cloud account required. Camera credentials remain in the local session.",
    computer: "Your computer · Quasar",
    ethernet: "Ethernet connection",
    camera: "Your IP cameras",
    diagram: "Local connection workflow",
    diagramNote:
      "Discovery and writes are initiated in the application. No camera data is sent to a platform.",
    workflow: "Make a change, then verify it.",
    steps: [
      "Discover cameras on the Ethernet network and verify their identity.",
      "Read capabilities and prepare supported settings.",
      "Confirm sensitive actions, then read back results from each camera.",
    ],
    control: "Keep control of your settings.",
    controlText:
      "The Sezaam profile is bundled. Your local profiles take precedence; camera settings are not applied at startup.",
    read: "Read about behaviour and limitations",
    versions: "Available versions",
    versionText:
      "Public version 0.2.0 is available on GitHub. The production preparation changes on this branch have not been published in a new version.",
    signing:
      "Version 0.2.0 has a local Mac signature without notarisation. The Windows installer has no distribution certificate. Check provenance and SHA-256 checksums before installation.",
    download: "Downloads and checksums",
    mac: "macOS · Apple Silicon",
    macInfo: "DMG for arm64. Intel Macs require a separate package.",
    win: "Windows · x64",
    winInfo: "Per-user NSIS installer, without automatic elevation.",
    linux: "Linux · x64",
    linuxInfo:
      "AppImage. Requires a graphical desktop, FUSE, user namespaces and iproute2.",
    prepared: "Build preparation and validation are separate.",
    preparedText:
      "CI is defined to build on each native system. A produced package or successful software test proves neither installation on your machine nor compatibility with a camera firmware.",
    platformDocs: "View the platform matrix",
    sources: "Project resources",
    technical: "Technical documentation",
    technicalText:
      "Architecture, hardware limits, distribution and validation procedures in the public repository.",
    design: "Components and identity",
    designText:
      "The design reuses the application’s Storybook components, tokens and local resources. The technical space will be protected at the origin.",
    asset: "Technical space (protected access)",
    footer: "Local application. No camera telemetry.",
    privacy: "This portal collects no data and includes no tracking.",
    assetTitle: "Quasar · technical space",
    assetIntro: "Identity and components of the local application.",
    storybook: "Open Storybook",
    tokens: "Design tokens",
    manifest: "Build manifest",
    assetNote:
      "Static artifact intended for asset.quasar.doublemart.fr. Origin protection must be configured before exposure. Storybook fixtures are simulated.",
    portal: "Public portal",
  },
};
const esc = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
function page(lang, technical = false) {
  const c = content[lang],
    base = technical
      ? "https://asset.quasar.doublemart.fr"
      : "https://quasar.doublemart.fr";
  return `<!doctype html><html lang="${lang}" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${esc(technical ? c.assetIntro : c.intro)}"><meta name="robots" content="noindex,nofollow"><link rel="canonical" href="${base}/${lang}/"><link rel="alternate" hreflang="${c.other}" href="${base}/${c.other}/"><title>${technical ? c.assetTitle : "Quasar — " + c.title}</title><link rel="icon" href="/static/symbol.svg" type="image/svg+xml"><script src="/static/theme.js"></script><link rel="stylesheet" href="/static/style.css"></head><body><a class="skip" href="#content">${c.skip}</a><header><a class="brand" href="/${lang}/"><img src="/static/symbol.svg" alt="">Quasar</a><nav aria-label="${c.docs}">${technical ? `<a href="/storybook/">Storybook</a>` : `<a href="#versions">${c.downloads}</a><a href="#resources">${c.docs}</a>`}<a href="/${c.other}/" lang="${c.other}" hreflang="${c.other}">${c.language}</a><label><span class="sr-only">${c.theme} </span><select data-theme-choice aria-label="${c.theme}"><option value="system">${c.system}</option><option value="light">${c.light}</option><option value="dark">${c.dark}</option></select></label></nav></header><main id="content">${technical ? `<section class="hero"><div><p class="eyebrow">QUASAR / DESIGN</p><h1>${c.assetIntro}</h1><p class="intro">${c.assetNote}</p><div class="actions"><a class="button" href="/storybook/">${c.storybook}</a><a href="/tokens.json">${c.tokens}</a></div><a href="/manifest.json">${c.manifest}</a></div><div class="diagram"><img src="/static/symbol.svg" alt=""><p>Quasar / Prisme</p><p class="muted">Sora · Inter · JetBrains Mono</p></div></section><a href="https://quasar.doublemart.fr/${lang}/">${c.portal}</a>` : `<section class="hero"><div><p class="eyebrow">${c.eyebrow}</p><h1>${c.title}</h1><p class="intro">${c.intro}</p><div class="actions"><a class="button" href="${release}">${c.release}</a><a href="${repository}">${c.source}</a></div><p class="muted">${c.local}</p></div><div class="diagram" role="img" aria-label="${c.diagram}"><img src="/static/symbol.svg" alt=""><div class="node">${c.computer}</div><div class="connector"></div><div class="node">${c.ethernet}</div><div class="connector"></div><div class="node">${c.camera}</div><small>${c.diagramNote}</small></div></section><section class="section two"><div><h2>${c.workflow}</h2><ol>${c.steps.map((s) => `<li>${s}</li>`).join("")}</ol></div><div><h2>${c.control}</h2><p>${c.controlText}</p><a href="${repository}/blob/main/docs/ARCHITECTURE.md">${c.read}</a></div></section><section class="section" id="versions"><p class="eyebrow">QUASAR / 0.2.0</p><h2>${c.versions}</h2><p>${c.versionText}</p><div class="note">${c.signing}</div><div class="platforms">${["mac", "win", "linux"].map((k) => `<article><h3>${c[k]}</h3><p>${c[k + "Info"]}</p><a href="${release}">${c.download}</a></article>`).join("")}</div><div class="note"><h3>${c.prepared}</h3><p>${c.preparedText}</p><a href="${repository}/blob/main/docs/PLATEFORMES.md">${c.platformDocs}</a></div></section><section class="section" id="resources"><h2>${c.sources}</h2><div class="two"><div><h3>${c.technical}</h3><p>${c.technicalText}</p><a href="${repository}/tree/main/docs">${c.docs}</a></div><div><h3>${c.design}</h3><p>${c.designText}</p><a href="https://asset.quasar.doublemart.fr/${lang}/">${c.asset}</a></div></div></section>`}</main><footer><span>Quasar · ${c.footer}</span><span>${c.privacy}</span></footer></body></html>`;
}
for (const [directory, technical] of [
  ["site-dist", false],
  ["assets-dist", true],
]) {
  const output = path.resolve(directory);
  if (
    path.dirname(output) !== process.cwd() ||
    !["site-dist", "assets-dist"].includes(path.basename(output))
  )
    throw Error("Unexpected static output directory");
  await rm(output, { recursive: true, force: true });
  await mkdir(`${directory}/static`, { recursive: true });
  for (const file of ["style.css", "theme.js"])
    await copyFile(`web/${file}`, `${directory}/static/${file}`);
  await copyFile(
    "src/renderer/design-system/tokens.css",
    `${directory}/static/tokens.css`,
  );
  await copyFile(
    "src/renderer/assets/InterVariable.woff2",
    `${directory}/static/Inter.woff2`,
  );
  await copyFile(
    "assets/brand/generated/symbol-light.svg",
    `${directory}/static/symbol.svg`,
  );
  for (const lang of ["fr", "en"]) {
    await mkdir(`${directory}/${lang}`, { recursive: true });
    await writeFile(`${directory}/${lang}/index.html`, page(lang, technical));
  }
  await writeFile(`${directory}/index.html`, page("fr", technical));
  await writeFile(`${directory}/robots.txt`, "User-agent: *\nAllow: /\n");
  if (technical) {
    await copyFile(
      "src/renderer/design-system/tokens.json",
      `${directory}/tokens.json`,
    );
    await cp("storybook-static", `${directory}/storybook`, { recursive: true });
  }
  const files = await inventory(directory);
  const manifest =
    JSON.stringify(
      {
        schemaVersion: 1,
        project: "quasar",
        version: pkg.version,
        commit,
        workingTreeDirty,
        generatedAt: new Date().toISOString(),
        kind: technical ? "technical-assets" : "public-portal",
        published: false,
        cameraData: false,
        files,
      },
      null,
      2,
    ) + "\n";
  for (const file of ["manifest.json", "version.json"])
    await writeFile(`${directory}/${file}`, manifest);
  await writeFile(
    `${directory}/SHA256SUMS.txt`,
    [
      ...files,
      ...["manifest.json", "version.json"].map((file) => ({
        file,
        sha256: sha256(manifest),
      })),
    ]
      .map(({ file, sha256 }) => `${sha256}  ${file}\n`)
      .join(""),
  );
}
console.log("Prepared site-dist and assets-dist/storybook. No deployment.");
