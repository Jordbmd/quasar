# Préparation production — 3 novembre 2026

Quasar reste une application Electron locale. Aucun compte cloud, OIDC, télémétrie ou envoi de données caméra n’est ajouté. Le [socle commun 1.0.1](standards/production.md) s’applique à la présentation, aux assets et aux rapports techniques.

## Exécution et langues

Sandbox, contextIsolation, webSecurity, permissions refusées, navigation bloquée et validation sender/mainFrame IPC sont conservés. Seuls file/blob et HTTP/WS loopback sont autorisés depuis le renderer. Les appels caméra restent côté main, déclenchés par les parcours existants, avec contrôle d’identité/adresse et confirmations. Le reset exige toujours `EFFACER`, dans les deux langues.

FR/EN est une préférence locale validée par IPC, persistée atomiquement dans `language.json` sous le dossier utilisateur historique. Menus et dialogues natifs suivent la langue ; le renderer attend cette préférence au démarrage. Le catalogue ne modifie ni profils, noms, modèle, série, IP/MAC, texte OSD ni valeurs protocole. Les réponses techniques non rédigées par Quasar gardent leur contenu. Les thèmes clair/sombre/système utilisent la clé `sezaam-theme` existante, avec application avant peinture et suivi du système seulement en mode système.

Le smoke Electron utilise exclusivement un dossier temporaire et `QUASAR_TEST_NO_NETWORK=1` ; il ne lit ni ne migre les données utilisateur. Il vérifie les langues et menus après redémarrage, les préférences, l’IPC invalide, la sandbox et le blocage HTTPS externe. Les intégrations ONVIF/RTSP utilisent des serveurs loopback et le binaire go2rtc officiel vérifié par `setup:video`.

## Portail et assets statiques

- `npm run build-storybook && npm run build:web` prépare `site-dist/` pour `https://quasar.doublemart.fr` et `assets-dist/` pour `https://asset.quasar.doublemart.fr`.
- Racine technique FR/EN, Storybook sous `/storybook/`, tokens et manifest de construction. Les fixtures sont explicitement simulées. Aucun serveur Vite/Storybook de développement à exposer.
- `version.json` et `manifest.json` désignent le commit, l'état propre/modifié et les SHA-256 de chaque fichier ; `SHA256SUMS.txt` couvre aussi ces manifests. Promouvoir ces sorties telles quelles, sans reconstruction sur le serveur. Les pages incluent noindex et `robots.txt` permet sa lecture ; configurer également `X-Robots-Tag: noindex, nofollow` sur les deux hôtes, fichiers et erreurs inclus.
- Le portail donne accès à la version publique [0.2.0 du 28 octobre](https://github.com/Jordbmd/quasar/releases/tag/v0.2.0), vérifiée le 3 novembre. Cette branche n’est pas une nouvelle release publiée. Aucun lien vers un nouvel installateur inexistant.
- Protéger **tout** l’hôte asset au reverse proxy, y compris fichiers statiques et `/storybook/`, avant exposition. Aucun cookie partagé avec l’application locale. L’artefact lui-même n’est pas un contrôle d’accès.
- Servir seulement les dossiers de sortie, sans listing, ni sources/données. Ajouter `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` au portail ; `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. Storybook nécessite une politique distincte compatible avec ses frames/styles ; le conserver sur l’hôte protégé, avec `X-Robots-Tag: noindex, nofollow` et `Cache-Control: private, no-store`.
- HTML/manifest portail : revalidation ; ressources sans hash : revalidation également. Pas de cache immutable sur les noms stables. TLS, domaine et protection d’origine restent à configurer, aucun déploiement dans ce lot.

## CI et fabrication

`.github/workflows/validation.yml` emploie uniquement des actions publiques épinglées par SHA, permission `contents: read`, Node 24 et `npm ci`. Windows 2022 x64, macOS 14 arm64 et Ubuntu 22.04 x64 fabriquent chacun leur installateur natif avec `--publish never`, après validation logicielle. Le workflow exécute aussi un paquet autonome isolé. Aucun secret, certificat, publication, téléversement vers la plateforme ou déploiement n’est configuré. Si GitHub Actions reste désactivé dans les réglages du dépôt, cette définition ne crée aucune preuve d’exécution distante.

Les artefacts contiennent installateur, `SHA256SUMS.txt`, manifest (version, commit, date, hôte, architecture, taille, hash, mode de signature), portails statiques et rapports. `nativePackaging` décrit l’hôte de construction ; `installationTested:false` et `cameraValidated:false` restent explicites. Le rapport plateforme ne contient que schemaVersion/project/commit/generatedAt/tool/kind/status/summary. Pas d’adresses réseau, identifiants, images ou journaux caméra. Un résultat CI n’est pas un état de santé d’une installation chez l’utilisateur.

Le runtime embarque également `dist/version.json`, contrôlé à l'intérieur de l'ASAR par le smoke du paquet autonome. Un artefact construit avant commit indique `workingTreeDirty:true` ; il ne constitue pas une livraison exacte de ce commit. La construction finale après commit doit indiquer `false`.

`npm run package:dir && npm run test:packaged` teste le paquet autonome. Cela ne lance pas l’assistant NSIS/DMG/AppImage et ne prouve pas leur installation. Le lanceur installé n’est jamais remplacé par ces tests.

## Signatures et coûts — aucune dépense engagée

macOS reste signé ad hoc, sans notarisation ; Windows sans certificat de distribution. Pour une livraison de confiance, prévoir Developer ID, hardened runtime et entitlements adaptés à Electron, notarisation puis ticket agrafé, et recette Gatekeeper sur machine propre. L’[Apple Developer Program](https://developer.apple.com/programs/) annonce 99 USD/an (ou devise locale) ; le compte et les certificats ne sont pas créés ici. Voir [notarisation electron-builder v26](https://www.electron.build/v26/docs/notarization/).

Windows nécessite une signature Authenticode et un service/certificat adapté (OV/EV ou service hébergé), avec validation d’identité et horodatage. Le coût dépend du fournisseur, de l’éligibilité et de la région ; consulter les [tarifs Microsoft Artifact Signing](https://azure.microsoft.com/en-us/pricing/details/artifact-signing/) ou un devis de l’autorité choisie. Ne pas promettre la disparition de tous les avertissements SmartScreen. Aucun secret de signature dans le dépôt ou les artefacts. [Documentation de signature v26](https://www.electron.build/v26/docs/features/code-signing/).

## État vérifié et limites

Les résultats locaux de cette branche sont conservés dans `test-results/` ignoré : tests métier et IPC, contrastes, formulaires simulés, Electron natif Windows, Storybook et portail. Le contrôle POSIX des permissions est explicitement non applicable sous Windows ; il ne valide pas les ACL. Les résultats macOS/Linux historiques décrits dans PLATEFORMES.md ne valident pas ce commit : attendre les nouveaux jobs et la recette native des installateurs.

Les anciennes références `test:visual` échouaient sur 10 des 12 cas sous Windows, de façon identique sur le commit initial `266ed1bc6c5b95a513e726acf4e312b7903b0569` et cette branche. Ce commit initial a été reconstruit séparément depuis une archive Git avec ses assets et polices : ses 12 captures et celles de la branche sont identiques octet par octet. Les nouvelles références Windows viennent exclusivement de cette reconstruction initiale, jamais de la branche modifiée. Les anciennes restent intactes. La [provenance](../tests/visual-baselines/windows-chrome/README.md) et les hashes sont versionnés ; les seuils existants ne changent pas. Le contrôle Windows réussit désormais sur les 12 cas et conserve les vérifications de reflow à 1100/724 px. En CI, `test:visual` est bloquant sur Windows avec Chrome, sans `continue-on-error` ; les autres OS exécutent les contrôles logiciels, Axe, runtime et packaging natifs. Une dérive du navigateur ou du rendu Windows reste un échec à examiner, pas une actualisation automatique des références.

L’audit runtime npm est à zéro. L’audit complet relève 26 dépendances d’outillage touchées par deux avis modérés glob/minimatch ; aucun changement majeur forcé n’est appliqué. Les rapports CI doivent être réévalués au moment de la livraison. Aucune caméra, installation utilisateur, signature de distribution ou nouvelle release validée/publiée par ce lot.
