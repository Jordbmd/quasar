# Distribution de Quasar

Trois formats sont préparés pour utiliser Quasar sans installer Node.js ni récupérer le dépôt source. L’application, les polices, le profil Sezaam et le relais go2rtc vérifié sont embarqués. Les données utilisateur et identifiants caméra ne sont jamais intégrés aux installateurs.

| Dossier de sortie | Format | Architecture |
| --- | --- | --- |
| `release/installers/macOS/` | DMG avec Quasar et un raccourci Applications | Apple Silicon sur ce Mac ; génération Intel possible séparément |
| `release/installers/Windows/` | Assistant NSIS `.exe`, installation pour le compte utilisateur | Windows x64 |
| `release/installers/Linux/` | AppImage portable | Linux x64 |

Chaque dossier contient un seul installateur, `INSTALLATION.txt` et son empreinte SHA-256 dans `SHA256SUMS.txt`. Les manifestes à la racine de `release/installers/` identifient la version, la plateforme, l’architecture et l’empreinte de chaque fichier préparé.

## Installation

**Mac :** ouvrir le DMG et glisser Quasar dans Applications. Le fichier `arm64` concerne les Mac Apple Silicon ; il ne fonctionne pas sur un Mac Intel. Au premier usage, autoriser le réseau local pour rechercher les caméras. La signature est locale, sans certificat Developer ID ni notarisation Apple : macOS peut bloquer le premier lancement ; utiliser l’autorisation proposée dans Réglages Système → Confidentialité et sécurité. Aucune désactivation globale de Gatekeeper n’est prévue.

**Windows :** ouvrir le fichier `Setup.exe`, choisir la langue puis suivre l’assistant. L’installation concerne le compte courant et crée une entrée dans le menu Démarrer. Ni l’installation ni Quasar ne demandent un compte administrateur. Aucun certificat Authenticode n’est configuré ; Windows peut signaler la provenance non reconnue. La désinstallation conserve le profil, les préférences et les journaux de l’utilisateur.

**Linux :** autoriser l’exécution de l’AppImage dans les propriétés du fichier, puis l’ouvrir. Un bureau graphique, le support AppImage/FUSE et les espaces de noms utilisateur nécessaires au bac à sable Chromium sont requis. L’outil `ip` du paquet `iproute2` est nécessaire à la lecture du réseau Ethernet. Le lanceur fourni conserve le bac à sable Electron et n’ajoute pas de contournement automatique. Une distribution qui le bloque doit être configurée selon sa politique système ; Quasar ne modifie pas le poste.

La session commune et les identifiants des caméras sont saisis dans l’application. Le profil local existant reste prioritaire sur celui fourni. L’installateur ne remplace pas automatiquement le lanceur de développement `~/Applications/Quasar.app` ni les données utilisateur.

## Génération locale

Utiliser Node.js 24 et les dépendances du lockfile (`npm ci`). Les commandes ci-dessous compilent d’abord l’application, téléchargent le relais officiel de la cible, vérifient son empreinte, puis génèrent le fichier sans publication :

```sh
npm run package:mac
npm run package:win
npm run package:linux
```

Depuis un Mac avec Docker disponible, `npm run package:all` génère les trois formats successivement. Le DMG doit être produit sur macOS. Windows se prépare sur Windows ou macOS avec NSIS 1.2.1 / makensis 3.12, épinglé et vérifié par electron-builder ; ce bundle permet la compilation sur Apple Silicon sans Rosetta. Linux se prépare nativement sur Linux x64 ou dans le conteneur officiel épinglé `electronuserland/builder:24` sur les autres hôtes.

Pour préparer le DMG Intel depuis macOS :

```sh
QUASAR_TARGET_ARCH=x64 npm run package:mac
```

Cette commande produit une variante distincte ; le dossier macOS ne conserve qu’un installateur à la fois. Une version universelle Intel/Apple Silicon n’est pas produite par ces commandes.

Le relais cible est préparé dans un dossier temporaire séparé : le binaire de développement dans `bin/` est préservé. Le contexte Docker contient seulement les fichiers compilés, les icônes, les fichiers npm, la configuration de packaging et les scripts nécessaires. Aucun dossier `.runtime`, dépôt Git, secret, socket Docker ou donnée utilisateur n’est transmis au conteneur. Celui-ci ne reçoit aucun mode privilégié. Les étapes sont séquentielles et un installateur existant n’est remplacé qu’après la réussite de sa génération.

`npm run package:dir` conserve la préparation d’un paquet autonome non installable pour les vérifications techniques. Les sorties `release/` sont ignorées par Git ; les binaires de distribution se partagent comme pièces jointes d’une version GitHub Releases, séparément du code source. La publication est une opération explicite distincte et GitHub Actions reste désactivé.

## Vérification avant distribution

Les trois fichiers de la version 0.2.0 ont été générés le 28 octobre 2026. Le DMG a été monté en lecture seule, sa signature vérifiée et son application exécutée avec le parcours Electron isolé, sans réseau caméra ni données réelles. L’installateur Windows et l’AppImage ont été décompressés et inspectés : architecture x64, ressources Quasar, bon relais, absence de données privées ; le lanceur et l’entrée de bureau Linux conservent le bac à sable. Leur installation et leur lancement sur des postes Windows/Linux natifs restent à vérifier. Les résultats locaux figurent dans `test-results/installers-audit.json` et `test-results/smoke-packaged.json`, ignorés par Git.

Vérifier l’empreinte de chaque fichier et l’absence de données privées. Sur Mac, vérifier la signature, monter le DMG en lecture seule et lancer le parcours isolé avec `QUASAR_PACKAGED_EXECUTABLE` et des données de test temporaires. Pour Windows et Linux, la construction et l’inspection des fichiers ne remplacent pas l’installation et les essais sur un poste natif. La recette réseau/caméra reste distincte de celle des installateurs.

Sources : [DMG](https://www.electron.build/v26/docs/dmg/), [NSIS](https://www.electron.build/v26/docs/nsis/), [AppImage](https://www.electron.build/v26/docs/appimage/) et [compilation multiplateforme](https://www.electron.build/v26/docs/features/multi-platform-build/).
