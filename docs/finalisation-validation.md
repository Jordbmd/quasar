# Validation — revue d’architecture du 4 novembre 2026

**État de cette mission : validations locales ci-dessous ; nouvelles CI, nouveaux artefacts retenus et requalification du laboratoire EN ATTENTE.** Les preuves historiques ne qualifient pas automatiquement le nouveau runtime.

## Quasar : changement et preuve locale

Source avant : `49648367b2364448f151a52ebec78079f76ac1d4`. Commit runtime corrigé : `2869e5f94734b9237eb10a00f2bf417c77e0891c` (distinct du futur commit documentaire, des règles et de la CI). Journal détaillé local : `.local/architecture-review-result.md`.

CameraService possède l’annulation dès la garde de route ; aucun accès caméra ni cache après résultat tardif. `abortable` libère ses écouteurs tout en observant les rejets tardifs. CameraReader utilise des identités uniques entre instances. IPC/exclusivité, adaptateurs système, confirmations, écritures incertaines, Box/imports et coffre opt-in conservés.

`node node_modules/vitest/vitest.mjs run` : **315 passent/1 échoue/1 skip avant → 321 passent/1 skip POSIX après**, 37 fichiers. Ciblage cancellation/camera-reader/session/ipc-controller : **21/21**. `npm run check:types`, `check:lint`, `check:architecture`, `check:dependencies`, `build`, `test:ui` passent : 114 modules/336 dépendances, smoke Electron sans caméra (Box/CSV, FR/EN, thèmes, clavier/Axe, sandbox).

`node --experimental-transform-types .local/architecture-measure.mjs` : 5 × 1 000 annulations synthétiques ; écouteur encore attaché **5 000/5 000 cas → 0/5 000**, événement obsolète accepté **1 → 0**. Médiane **8,5851 → 8,9320 ms**, aucun gain de vitesse revendiqué ; compte cumulé de cas, pas mémoire résidente.

Deux échecs RTSP préexistants, cause non établie. Répétitions isolées : 5 × `node node_modules/vitest/vitest.mjs run tests/integration.test.ts -t "démarre en local, ne contacte pas le RTSP"` : **5/5**, médiane 1 414 ms ; 5 × même commande avec `-t "envoie TEARDOWN avant de fermer le proxy"` : **5/5**, médiane 2 096 ms, 15 cycles PLAY/TEARDOWN. Timeout 4 000 ms inchangé ; aucune correction du relais revendiquée. Aucun matériel caméra réel.

## Règles partagées et nettoyage

Migration vers le socle v2 : [manifest.json](standards/manifest.json) fait autorité pour version, profil, commit canonique exact et hashes. `node docs/standards/verify.mjs` réussit hors ligne sur les exports présents lors de cette revue : cohérence locale, pas preuve de dernière version distante. Toute mise à jour ultérieure du manifest doit être revérifiée. Les instructions locales restent dans AGENTS ; aucun checkout privé ni secret requis par le vérificateur.

Nettoyage Git limité : ancien worktree Mira `mira-finalisation` et branche locale `codex/finalisation` supprimés ; aucune PR fermée, unique PR Dependabot conservée. Le checkout `finance` reste protégé : **29 entrées / 40 fichiers** ; Singularity est travaillé dans un checkout séparé. Aucune suppression générale de branches ou de données.

- [ ] CI finale sur les nouveaux SHA : résultats à rattacher.
- [ ] Nouveaux artefacts : checksums, conservation et commit construit à qualifier.
- [ ] Laboratoire avec ces artefacts : requalification à faire ; aucun ancien résultat réétiqueté.

Invariants conservés : **12 volumes persistants + PostgreSQL**, `owner_only` pour Mira/Singularity/Orbit, déconnexion application + SSO laissant éventuellement les autres sessions actives. Quasar natif hors ligne sans compte ; Windows/Linux/DMG non signés, application macOS ad hoc sans signature de distribution ni notarisation. Aucun déploiement, fusion, DNS, achat ou publication.

## Historique — validation antérieure à cette mission

316 tests Windows et 1 POSIX non applicable ; 317 sur POSIX. 44 stories × 4 variantes, 12 références Windows, 22 RTSP/superviseur.

La suite Storybook conserve sa propre instance Axe pour éviter une concurrence avec l’instance chargée par l’addon. Les deux scans restent actifs ; aucune règle ni variante n’est supprimée. Ce correctif du harnais de test et les mises à jour documentaires ne changent pas les runtimes des paquets retenus au commit dd8215f.

Les preuves CI et artefacts retenus sont dans [retained-artifacts.json](retained-artifacts.json). Elles identifient le commit réellement construit, distinct du dernier commit documentaire. Les anciennes exécutions ne servent pas à valider un nouveau changement de runtime.

Le laboratoire Platform utilise les vrais runtimes, Authentik et SMTP synthétiques, TLS vérifié et aucun port hôte. Il qualifie SSO/retour, invitations, récupération, expiration/usage unique, MFA et secours, révocation CLI, sessions et limites du logout global. Mira/Singularity/Orbit restent explicitement owner_only.

Six interfaces : web-vitals 6.2.3 standard, vues dédupliquées, transport borné sans contenu personnel ; chaîne réelle collecteur/admin, douze rapports CI/audit sourcés, catalogue visible/masqué/vide/panne/cache persistant. Cinq échantillons par mode/app pour le coût et collecteur réellement arrêté pour le test de panne.

Cinq hôtes asset : vingt contrôles des pages/fichiers/ZIP/Storybook/iframes et accès direct. Compose : réseau DB et Chromium privés, volumes/permissions/health et redémarrage. Douze volumes (applications, identité et Caddy) et PostgreSQL restaurés vers des destinations neuves, vrai login sur les copies ; rollback image et données distincts. Profil Chromium peuplé synthétiquement conservé.

Preuves transverses : doublemart-platform/docs/validation-evidence.json et tests/authentik-integration. Les mesures Docker Desktop ne garantissent pas la capacité du futur VPS. Les tests ciblés et audits ne sont pas une certification générale ; les avis modérés de développement restent visibles. Aucun téléphone, matériel caméra, installation utilisateur, donnée personnelle ou déploiement n’est déclaré testé.

Le portail retenu et son chargement sans reconstruction sont détaillés dans [portal-artifact.json](portal-artifact.json). Docker classique et containerd exposent des identifiants différents : la chaîne OCI archive → manifeste → configuration est vérifiée par hash, ainsi que le label du commit.

## Périmètres de preuve — reprise du 4 novembre 2026

- **Sauvegarde Compose** : 12 volumes persistants (applications, identité et Caddy) **+ PostgreSQL**, sauvegardé logiquement et restauré dans une base neuve. Preuve : `doublemart-platform/docs/validation-evidence.json`, section `recovery` (8 contrôles). Les neuf volumes applicatifs ne sont pas le total de la plateforme. Les douze relevés de ressources sont un autre décompte.
- **Déconnexion** : l’action SSO ferme la session de l’application appelante et celle du fournisseur d’identité. Les sessions déjà ouvertes dans les autres applications peuvent rester actives jusqu’à leur expiration ou leur propre déconnexion/révocation. Aucun back-channel logout ni déconnexion instantanée de toutes les applications n’est promis.
- **Propriétaire** : Mira, Singularity et Orbit réservent les historiques au couple issuer/sub configuré (`owner_only`). Une invitation ne donne pas accès à ces historiques. Portfolio et portail Quasar sont publics ; leurs espaces asset sont protégés séparément. Quasar natif reste hors ligne sans compte obligatoire ; l’administration Platform requiert son habilitation et le MFA.
- **Signatures Quasar** : Windows, Linux et DMG non signés ; application macOS signée **ad hoc**, vérification `codesign` effectuée, sans signature de distribution ni notarisation. Voir `quasar/docs/retained-artifacts.json`. Aucune recette caméra ou installation utilisateur n’est déduite de la fabrication des paquets.
- **Local et CI** : chaque résultat conserve sa commande et son commit source. Les 24 scans Axe d’Authentik qualifient l’identité uniquement, pas Orbit. Singularity : **8 tests Storybook dans la CI** (`src/RequestState.stories.tsx`) ; **79 tests dans 8 fichiers lors de l’exécution locale complète**, preuve `Singularity/docs/storybook-full-2026-11-04.json`. Le décompte historique de 79 tests serveur est distinct de Storybook ; la revue actuelle de Singularity en exécute 81.
- **Artefacts retenus** : les SHA de `retained-artifacts.json` restent ceux des images/paquets réellement conservés. Ces références historiques sont conservées ; les nouveaux artefacts restent en attente de qualification. Les anciennes images Mira/Orbit ne qualifient pas les nouvelles corrections d’interface ; les validations de cette PR et leurs artefacts portent leurs propres SHA. Aucune image n’est déclarée déployée.
