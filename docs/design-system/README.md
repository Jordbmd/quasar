# Quasar — identité et design system

Quasar configure et diagnostique des caméras IP localement. Deux écrans existent : Caméras et Diagnostic. La connexion Ethernet du hub est automatique. Cette migration ne crée ni assistant réseau ni écran métier fictif. Voir [l’inventaire de migration](INVENTAIRE.md).

## Sources et reproduction

La planche fournie est une référence raster. Les SVG sont une **reconstruction vectorielle**, pas un master original. `assets/brand/source/symbol.svg` est la source géométrique éditable : quatre pales symétriques, étoile à quatre branches et cercle central parfaitement rond. Aucun bitmap embarqué, filtre, halo ou relief.

Le logotype est dérivé de Sora 800, mis en tracés avec fontkit et ses avances/crénages. Le Q utilise le contour rond du O et une queue diagonale dessinée dans le générateur pour se rapprocher du Q de la référence. Les proportions et le placement du point magenta sont explicites. Les exports fonctionnent sans police installée. La reconstruction reste distincte d’un fichier de marque original validé par son auteur.

`npm run brand:build` lit le symbole et la police, produit les autres SVG sources (wordmark, horizontal, compact, vertical, app-icon), les exports et les tokens CSS. Modifier la géométrie dans le symbole source, la composition/logotype dans `scripts/brand-build.mjs`, les tokens dans `src/renderer/design-system/tokens.json`. Ne pas corriger à la main un export généré.

| Dossier | Contenu / usage |
| --- | --- |
| `assets/brand/source` | SVG éditable et compositions vectorielles dérivées |
| `assets/brand/generated` | Logos SVG/PNG transparents, JPEG à fond uni, favicons, planche de contrôle |
| `build/icons` | ICNS macOS, ICO Windows multirésolution, PNG desktop/Linux 16 à 1024 px |
| `src/renderer/assets/brand` | Deux petits SVG horizontaux réellement utilisés dans l’application |
| `src/renderer/public` | Favicon et initialisation du thème avant React |
| `assets/fonts` | Sora et JetBrains Mono, fichiers de licence OFL |
| `src/renderer/assets` | Inter Variable et sa licence OFL |

Le manifeste `assets/brand/generated/manifest.json` recense 98 fichiers avec usage, dimensions, transparence, format, taille et SHA-256. La planche `review-board.png` est un contrôle supplémentaire. Les PNG de logos ont une largeur de 128, 256, 512 ou 1024 px, hauteur proportionnelle. Les JPEG de présentation ont une largeur de 1024 px et un fond explicite. Aucun JPEG de favicon.

## Choisir une variante

- `horizontal-dark` : pales et lettres blanches, sur fond sombre. `horizontal-light` : bleu nuit, sur fond clair. Même principe pour compact, vertical et wordmark.
- `symbol-dark/light` : symbole couleur autonome ; `symbol-mono-black/white` : une seule encre, cercle central en réserve. `horizontal-mono-*` : logo entièrement monochrome.
- `compact` : petits espaces verticaux ; `vertical` : présentation empilée avec respiration supérieure.
- `app-icon` : symbole sur carré bleu nuit à angles arrondis. `quasar.icns` est intégré au paquet macOS ; `quasar.ico` est prêt pour un futur packaging Windows. Ces assets ne signifient pas que le backend Windows/Linux est implémenté.
- Favicons : SVG, ICO (16/32/48/64/128/256), PNG 16/32/48, Apple 180, Android 192/512.

Conserver le ratio, les couleurs et le cercle central. Ne pas étirer, ombrer, entourer d’un glow ou ajouter de texture au symbole. Pour une composition externe, réserver autour du logo une zone libre d’une largeur de symbole ; les SVG contiennent une marge technique, pas toute cette zone. Symbole autonome : 24 px minimum conseillé, 32 px préférable. Favicon 16 px : exception testée, sans mot. Logo horizontal dans l’application : largeur 182 px. Ne pas utiliser le wordmark à 16 px. Les fonds cosmiques ne sont pas des fonds de travail.

## Tokens et thèmes

`tokens.json` sépare primitives de marque, valeurs sémantiques de chaque thème et dimensions. `scripts/design-tokens.mjs` produit `tokens.css`, avec familles, couleurs vidéo fixes, ombre discrète et voile modal. Les composants partagent ces variables.

| Rôle | Sombre | Clair |
| --- | --- | --- |
| Fond | `#0A0F28` | `#FAF9FD` |
| Surface | `#121A36` | `#FFFFFF` |
| Texte principal | `#F4F3FA` | `#0A0F28` |
| Texte secondaire | `#BAC3DC` | `#46516A` |
| Action principale | `#B02C73` + blanc | `#A92368` + blanc |
| Sélection | `#2D2144` | `#F6E6F0` |
| Focus | `#FFB4D8` | `#A11E64` |
| Succès | `#69DAA2` | `#0F6B42` |
| Avertissement | `#F2C37B` | `#805000` |
| Erreur | `#FF9DA8` | `#B32345` |
| Non pris en charge | `#D4B8EA` | `#6B4683` |

Un état combine texte, icône et couleur. Le rose représente les actions et sélections ; il ne remplace pas les états sémantiques. Surfaces et bordures sont unies. Les bordures de séparation décoratives (`line`) sont plus discrètes que les contours essentiels des champs (`border`).

Espacements : 4/8/12/16/24/32/48 px. Rayons : 6/10/16 px. Contrôles : 36 px minimum, variante grande 44 px ; libellés de cases cliquables. Focus : contour 3 px décalé de 3 px. Z-index séparés pour éléments collants, aperçu agrandi et modales natives.

Sora : titres 24/16/14 px, poids 600–700. Inter : interface 14 px, secondaires 12–13 px, interligne 1,5. JetBrains Mono : IP, MAC, ports, valeurs et journaux. Aucun texte inférieur à 12 px. Fallbacks explicites ; les trois polices sont locales, sous SIL OFL 1.1. Les fichiers OFL sont conservés avec les polices ; aucun appel Google Fonts au lancement.

Le thème suit macOS au premier usage et les changements système tant qu’aucun choix manuel n’a été enregistré. Le bouton clair/sombre conserve le choix entre lancements. La clé historique `sezaam-theme` est préservée. `theme-init.js` s’exécute avant React ; Electron affiche sa fenêtre après chargement. Les animations sont supprimées avec `prefers-reduced-motion`. Les couleurs de fond des boutons ne sont pas interpolées lors du changement de thème, pour éviter un contraste transitoire insuffisant.

## Composants utilisés

| Fichier | Composants / responsabilités |
| --- | --- |
| `design-system/components.tsx` | Button (primaire/secondaire/tertiaire/destructif, icône, disabled/loading), Panel, Field, Badge, Alert, EmptyState, Loading, Skeleton, Modal, useConfirmation |
| `design-system/Brand.tsx` | Logo accessible, variante adaptée au thème |
| `design-system/camera.tsx` | CameraCard, CameraFacts, VideoPlaceholder, DiagnosticResults, EventLog |
| `ui.tsx` | Alias Field/Status communs et Capability ONVIF |
| `Settings.tsx` | Les trois formulaires réels, brouillon, Annuler/Appliquer, capacités et résultats de relecture |
| `main.tsx` | Navigation des deux pages, barre réseau, liste, aperçu, ajout par IP et état de session |
| `VideoPlayer.tsx` | Lecture réelle MSE et erreurs du relais, sans flux fictif |

Les contrôles input/select/checkbox/radio restent HTML natif, enveloppés par Field lorsque pertinent. Les titres natifs des boutons fournissent l’aide brève existante. Aucun switch, popover, onglet, textarea ni barre de progression fictive n’a été ajouté pour remplir le catalogue. Les notifications restent des bannières persistantes et dismissibles ; aucune disparition temporisée d’une erreur importante.

Modal utilise `dialog.showModal()`, un nom accessible, un cycle Tab/Maj+Tab, Échap et la restauration du focus. La confirmation d’abandon d’un brouillon est locale et choisit la conservation par défaut. Les confirmations sensibles avant écriture caméra restent natives côté Electron. L’aperçu agrandi garde les interactions dans sa zone, restaure le focus et se ferme par Échap.

## Storybook local

```sh
npm run storybook         # http://127.0.0.1:6006
npm run build-storybook   # storybook-static/
npm run test:stories     # navigateur Chrome local, Axe et interactions
```

Storybook 10.6.2 utilise React+Vite, les addons officiels docs et a11y, sans service cloud. Télémétrie désactivée. Barre d’outils : thèmes sombre/clair. Controls : états des boutons et cartes, aperçu sélectionné/connecté. Autodocs et descriptions accompagnent les composants. Les stories couvrent fondations, primitives, caméra, formulaires groupés réseau/vidéo/OSD, diagnostics et pages complètes.

`stories/fixtures.ts` est la seule passerelle de simulation : aucun import Electron, aucun socket caméra, adresses réservées `192.0.2.0/24`, données marquées SIMULATION. Toute écriture ou ouverture de vidéo est refusée par le mock. Les tests interdisent tout accès externe. Les stories sont hors du point d’entrée de production ; Storybook n’entre pas dans `dist/renderer` ni dans le lanceur.

## Vérifications et références visuelles

```sh
npm run brand:build
npm run test:brand
npm run test:contrast
npm run build
npm test
npm run test:forms
npm run test:ui
npm run build-storybook
npm run test:stories
npm run test:visual
```

`test:brand` vérifie les SHA-256, le XML SVG, l’absence de bitmap/filtre/texte dépendant d’une police, le cercle central, les dimensions, les transparences, les répertoires ICO/ICNS et l’intégration de l’icône au générateur de lanceur. `test:contrast` calcule 130 rapports selon la luminance WCAG : textes ≥ 4,5:1, composants et focus ≥ 3:1.

Axe contrôle toutes les stories dans les deux thèmes et les parcours de l’application. Les scénarios Playwright vérifient aussi clavier, focus, thèmes système/manuel, recherche parmi 180 caméras, formulaire, OSD, erreur vidéo, diagnostic et absence de choix réseau. Les 70 tests Vitest couvrent les protections et transports existants via simulations locales.

Les références Playwright dans `tests/visual-baselines` couvrent les deux pages, une caméra sélectionnée, erreur, chargement et modal, dans les deux thèmes à 1448×1086. Comparaison pixels RGBA : différence >20 sur un canal, échec si plus de 0,1 % de pixels changés ; les différences sont enregistrées dans `test-results/visual`. Même OS, navigateur et polices requis. `npm run test:visual:update` remplace volontairement les références ; toujours inspecter les captures avant de les accepter. Reflow contrôlé à 1100 px et à 724 px (largeur équivalente à 200 % sur 1448 px).

L’inspection visuelle complète les calculs : logo sur fonds unis clair/sombre, transparence, petits formats, en-tête, lisibilité des données, focus et formulaires. Défauts corrigés pendant l’audit : nom accessible du logo, focus des modales, chevauchement de liste au zoom, contraste transitoire lors du changement de thème. Les rapports sont des preuves de contrôles ciblés, pas une certification WCAG complète ni un audit lecteur d’écran exhaustif.

## Packaging et limites

`npm run launcher` reconstruit assets, application et `Quasar.app`. Le lanceur macOS intègre `quasar.icns`, les titres et menus Quasar et une signature ad hoc vérifiée. Il dépend du projet local. Il ne constitue pas un installateur autonome ou notarié.

Le bundle ID `fr.sezaam.camera-tool`, le nom npm, l’IPC `sezaam:*`, le pont `window.sezaam`, les variables `SEZAAM_*` et `.runtime` restent stables pour préserver préférences, sauvegardes et autorisations. L’UUID Mach-O de l’exécutable est conservé avec la même version Electron. macOS peut encore afficher l’ancien nom dans un consentement déjà enregistré.

Aucun matériel n’est contacté par Storybook ou les tests simulés. La compatibilité réelle de chaque caméra/firmware, le PoE, l’authentification, le flux et les écritures restent à valider avec le matériel branché selon [la recette matérielle](../RECETTE-MATERIELLE.md). Les icônes Windows/Linux sont prêtes, leurs exécutables et leur réseau système restent à porter.

## Résultat de la recette locale — 19–20 octobre 2026

- Build application et build Storybook : réussis.
- Vitest : 70/70. Parcours formulaires simulés et smoke Electron : réussis.
- Storybook : 31 stories × 2 thèmes, aucune violation Axe détectée, aucune erreur JavaScript et aucune requête externe. Tab/Échap, restauration du focus, aperçu agrandi, conservation/abandon du brouillon et thème système/manuel vérifiés.
- Contrastes : 130/130. Assets : 98 vérifiés. Comparaisons visuelles : 12/12, reflow 1100/724 px sans débordement horizontal, captures inspectées.
- `~/Applications/Quasar.app` : signature locale vérifiée, ICNS identique au fichier généré, titre/menu/logo inspectés dans la fenêtre installée. Recherche Spotlight confirmée par les métadonnées et le résultat `Quasar.app`.
- Ancien lanceur conservé dans `.runtime/launchers-1792439926321/Sezaam.app.backup`. Préférences et sauvegardes non déplacées.
- Limites : le contrôle natif du Dock ne répond pas ; l’intégration du fichier ICNS est vérifiée mais son rendu dans le Dock reste à confirmer visuellement. Aucun hub ni caméra branché lors de cette recette. Aucune modification du réseau macOS ni d’un équipement réel.

Sources des outils : [Storybook React + Vite](https://storybook.js.org/docs/get-started/frameworks/react-vite/), [accessibilité Storybook](https://storybook.js.org/docs/writing-tests/accessibility-testing). Polices : [Sora](https://github.com/google/fonts/tree/main/ofl/sora), [JetBrains Mono](https://github.com/google/fonts/tree/main/ofl/jetbrainsmono), [Inter](https://github.com/rsms/inter). Les licences distribuées sont la référence locale.

Pour réinstaller volontairement une version reconstruite : `npm run launcher:install`. Fermer d’abord Quasar. Le script conserve les anciens lanceurs avant installation et enregistre Quasar auprès de Launch Services et Spotlight.
