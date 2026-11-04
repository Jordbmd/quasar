# Validation — revue d’architecture du 4 novembre 2026

**État de cette mission : code runtime validé en CI, nouveaux artefacts retenus et laboratoire requalifié le 4 novembre 2026.** Les dernières validations des commits de dossier sont rattachées à la PR ; elles ne changent pas le SHA des images qualifiées.

## Quasar : changement et preuve locale

Source avant : `49648367b2364448f151a52ebec78079f76ac1d4`. Commit runtime corrigé : `2869e5f94734b9237eb10a00f2bf417c77e0891c` (distinct du futur commit documentaire, des règles et de la CI). Journal détaillé local : `.local/architecture-review-result.md`.

CameraService possède l’annulation dès la garde de route ; aucun accès caméra ni cache après résultat tardif. `abortable` libère ses écouteurs tout en observant les rejets tardifs. CameraReader utilise des identités uniques entre instances. IPC/exclusivité, adaptateurs système, confirmations, écritures incertaines, Box/imports et coffre opt-in conservés.

`node node_modules/vitest/vitest.mjs run` : **315 passent/1 échoue/1 skip avant → 321 passent/1 skip POSIX après**, 37 fichiers. Ciblage cancellation/camera-reader/session/ipc-controller : **21/21**. `npm run check:types`, `check:lint`, `check:architecture`, `check:dependencies`, `build`, `test:ui` passent : 114 modules/336 dépendances, smoke Electron sans caméra (Box/CSV, FR/EN, thèmes, clavier/Axe, sandbox).

`node --experimental-transform-types .local/architecture-measure.mjs` : 5 × 1 000 annulations synthétiques ; écouteur encore attaché **5 000/5 000 cas → 0/5 000**, événement obsolète accepté **1 → 0**. Médiane **8,5851 → 8,9320 ms**, aucun gain de vitesse revendiqué ; compte cumulé de cas, pas mémoire résidente.

Deux échecs RTSP préexistants, cause non établie. Répétitions isolées : 5 × `node node_modules/vitest/vitest.mjs run tests/integration.test.ts -t "démarre en local, ne contacte pas le RTSP"` : **5/5**, médiane 1 414 ms ; 5 × même commande avec `-t "envoie TEARDOWN avant de fermer le proxy"` : **5/5**, médiane 2 096 ms, 15 cycles PLAY/TEARDOWN. Timeout 4 000 ms inchangé ; aucune correction du relais revendiquée. Aucun matériel caméra réel.

## Règles partagées et nettoyage

Migration vers le socle v2 : [manifest.json](standards/manifest.json) fait autorité pour version, profil, commit canonique exact et hashes. `node docs/standards/verify.mjs` réussit hors ligne sur les exports présents lors de cette revue : cohérence locale, pas preuve de dernière version distante. Toute mise à jour ultérieure du manifest doit être revérifiée. Les instructions locales restent dans AGENTS ; aucun checkout privé ni secret requis par le vérificateur.

Git Quasar : main, la branche `codex/production-readiness` et sa PR de préparation sont conservées. Aucun nettoyage de branche ou de worktree Quasar, aucune PR Quasar fermée ; aucun travail local supprimé.

- [x] CI du runtime et des règles : [run 41826721312](https://github.com/Jordbmd/quasar/actions/runs/41826721312), source `fc54e19e1907b4b35946deb78e1d1d6ab7de583a`, construit `8306a7d38e4516770b868fd7a0856036cfec509c`. Dernière CI de branche documentaire : voir les checks de la PR.
- [x] Nouveaux artefacts retenus : archive, checksum, source et commit construit dans [retained-artifacts.json](retained-artifacts.json) ; chargés sans reconstruction.
- [x] Portail et espace asset Quasar requalifiés dans le laboratoire isolé le 4 novembre ; paquets natifs vérifiés par la CI des trois OS. Aucun test matériel ou installation utilisateur déduit de ces preuves.

Périmètre : application native hors ligne sans compte obligatoire ni télémétrie caméra, portail public et espace asset protégé séparément. Windows/Linux/DMG non signés ; application macOS ad hoc sans signature de distribution ni notarisation. Aucun déploiement, fusion, DNS, achat ou publication.

## Historique — validation antérieure à cette mission

316 tests Windows et 1 POSIX non applicable ; 317 sur POSIX. 44 stories × 4 variantes, 12 références Windows, 22 RTSP/superviseur.

La suite Storybook conserve sa propre instance Axe pour éviter une concurrence avec l’instance chargée par l’addon. Les deux scans restent actifs ; aucune règle ni variante n’est supprimée. Ce correctif du harnais de test et les mises à jour documentaires ne changent pas les runtimes des paquets retenus au commit dd8215f.

Les preuves CI et artefacts retenus sont dans [retained-artifacts.json](retained-artifacts.json). Elles identifient le commit réellement construit, distinct du dernier commit documentaire. Les anciennes exécutions ne servent pas à valider un nouveau changement de runtime.

Le laboratoire historique qualifie ici uniquement le portail Quasar et son espace asset : accès anonyme ou tiers refusé pour les ressources privées, protection des fichiers/archives/Storybook/iframes et de l’origine. Les mesures web concernent le portail ; aucune statistique ni donnée caméra ne quitte l’application native.

Le portail applique noindex aux pages, fichiers et erreurs. Son collecteur web est borné et abandonnable ; sa panne ne doit pas bloquer la consultation. Les tests de comptes, d’administration ou d’autres applications ne sont pas des preuves de fonctionnement de Quasar natif.

Les tests ciblés et audits ne sont pas une certification générale. Aucun matériel caméra, installation utilisateur, donnée personnelle ou déploiement réel n’est déclaré testé. La nouvelle image du portail a été requalifiée en laboratoire ; les installations utilisateur et caméras restent à vérifier.

Le portail historique et son chargement antérieur sont détaillés dans [portal-artifact.json](portal-artifact.json) ; le portail courant qualifié figure dans [retained-artifacts.json](retained-artifacts.json). Docker classique et containerd exposent des identifiants différents : la chaîne OCI archive → manifeste → configuration est vérifiée par hash, ainsi que le label du commit.

## Périmètres de preuve — Quasar

- **Stockage natif** : sauvegardes/imports et migrations sont exercés avec des données synthétiques isolées. Le portail n’a pas de base de données métier. Les éventuels **12 volumes + PostgreSQL** de services partagés sont un périmètre d’exploitation distinct ; ils ne constituent pas la sauvegarde de l’application native Quasar.
- **Identité** : aucun compte obligatoire ni invitation/récupération applicative pour Quasar natif. Le portail est public ; l’espace asset est authentifié séparément. La déconnexion du fournisseur d’identité ne promet pas la fermeture instantanée des autres sessions et ne déconnecte pas les caméras de l’application locale.
- **Signatures** : Windows, Linux et DMG non signés ; application macOS signée **ad hoc**, vérification codesign effectuée, sans signature de distribution ni notarisation. Voir [retained-artifacts.json](retained-artifacts.json). Fabriquer un paquet ne prouve ni une installation utilisateur ni une recette caméra.
- **Local et CI** : les comptes actuels **321 tests passants + 1 skip POSIX**, smoke Electron/Axe, tests de lectures et répétitions RTSP sont décrits plus haut avec leur source. Les 44 stories × 4 variantes et les anciens tests natifs sont historiques ; aucune preuve d’une autre application ne les remplace.
- **Artefacts retenus** : les SHA de [retained-artifacts.json](retained-artifacts.json) et [portal-artifact.json](portal-artifact.json) sont ceux des paquets/images réellement conservés. Le premier dossier identifie les nouveaux artefacts qualifiés et conserve les anciens séparément ; portal-artifact.json reste une preuve historique. Aucun paquet ni portail n’est déclaré publié ou déployé par cette mission.
