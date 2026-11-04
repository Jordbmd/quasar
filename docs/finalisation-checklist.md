# Checklist de finalisation — quasar

État de cette mission au 4 novembre 2026. Validations locales et historique antérieur séparés ; aucune ancienne CI ne qualifie les nouveaux changements.

## Qualification précédente — 12:40 UTC

- [x] Architecture et régressions locales au commit runtime `2869e5f94734b9237eb10a00f2bf417c77e0891c` : [commandes, mesures avant/après et limites](finalisation-validation.md).
- [x] Export du socle versionné cohérent hors ligne via `node docs/standards/verify.mjs` ; [manifest](standards/manifest.json) comme autorité de version/source.
- [x] Git Quasar : main, branche et PR de préparation conservées ; aucun nettoyage local de branches/worktrees ni fermeture de PR Quasar.
- [x] CI du runtime et des règles : [run 41826721312](https://github.com/Jordbmd/quasar/actions/runs/41826721312), source `fc54e19e1907b4b35946deb78e1d1d6ab7de583a`, construit `8306a7d38e4516770b868fd7a0856036cfec509c`. Dernière CI de branche documentaire : voir les checks de la PR.
- [x] Nouveaux artefacts retenus : archive, checksum, source et commit construit dans [retained-artifacts.json](retained-artifacts.json) ; chargés sans reconstruction.
- [x] Portail et espace asset Quasar requalifiés dans le laboratoire isolé le 4 novembre ; paquets natifs vérifiés par la CI des trois OS. Aucun test matériel ou installation utilisateur déduit de ces preuves.

## Clôture complémentaire après le bilan

- [x] Nouvelle CI native trois OS, paquets retenus et portail requalifié : [preuves exactes](finalisation-validation.md#qualification-de-clôture--4-novembre-2026).

- [x] Revue explicitée par frontière : examiné, problème confirmé, correction, conservation justifiée et dette dans [ARCHITECTURE.md](ARCHITECTURE.md#clôture-de-la-revue--périmètre-examiné-et-dette). Pas de certification globale déduite du seul refactoring.
- [x] Restauration native synthétique source et paquet autonome Windows : copie à froid, 67 fichiers comparés, nouvelle destination, Box/langue/thème/journal restaurés, originaux conservés. Commandes et limites dans [validation](finalisation-validation.md#complément-de-clôture--restauration-native-et-paquet-windows).
- [x] Chiffré restauré avec clé injectée, autre clé refusée, suppression de la copie sans effacer l’original : 35/35 tests ciblés après 34/34 baseline. Coffre OS réel non revendiqué (désactivé en test isolé).
- [x] Paquet autonome Windows ASAR/relai/persistance relancé ; procédures installation, sauvegarde et signatures préparées sans achat/publication.
- [ ] Assistant NSIS/DMG/AppImage sur machine jetable, coffre OS réel/migration de compte, signature de distribution/notarisation et caméra autorisée : preuves distinctes non exécutées ici.

## Historique de préparation antérieur

Les cases suivantes décrivent les preuves précédentes et leur périmètre propre ; elles ne constituent pas une validation nouvelle. Les SHA des artefacts historiques restent inchangés.

| Fait      | ID                                 | Résultat attendu                                        | État / preuve courte                                                                                                                                                                                |
| --------- | ---------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x]       | BASE — Maintenance                 | Instructions et changements Quasar préservés            | AGENTS local, export autonome vérifié et manifest source ; main et PR de préparation conservées.                                                                                                    |
| [x]       | SEC — Autorisations                | Gardes IPC, renderer et réseau caméra                   | Tests IPC/origine/permissions Electron, auto-login et addressing-conflicts ; réseau simulé, aucune écriture caméra réelle.                                                                          |
| [x]       | INPUT — Entrées                    | Imports, archives et frontières validés                 | Tests Box/workbook-archive : taille, nombre et expansion des entrées, formules refusées ; validation IPC et texte rendu.                                                                            |
| N/A natif | IDENTITY — Compte                  | Pas de compte obligatoire pour le bureau                | Quasar natif hors ligne ; portail public. Espace asset authentifié séparément : cette protection ne transforme pas le bureau en application SSO.                                                    |
| N/A natif | RECOVERY — Invitation/récupération | Pas de parcours de récupération de compte natif         | Sauvegarde/import de données locales distincts de la récupération d’identité du service protégeant les assets.                                                                                      |
| N/A natif | MFA — MFA                          | Pas de MFA imposée à Quasar hors ligne                  | La politique d’identité de l’espace asset appartient au service partagé ; aucune recette téléphone n’est revendiquée pour Quasar.                                                                   |
| [x]       | LOGOUT — Déconnexion               | Déconnexion caméra distincte de l’identité web          | Tests session : connexions/caches invalidés. La déconnexion de l’espace asset/SSO ne promet pas une fermeture universelle et ne ferme pas les sessions caméra locales.                              |
| [x]       | ISOLATION — Données                | Contexte local caméra/Box et espace asset isolés        | Tests Box library, session, associations et brouillons. Portail public sans historique caméra ; contrôle d’accès distinct sur asset.quasar.doublemart.fr.                                           |
| [x]       | I18N — FR/EN                       | FR/EN applicatif, sans traduire les données caméra      | Smoke Electron : langue et menus natifs persistés après redémarrage, IPC langue invalide refusée ; stories Quasar FR/EN.                                                                            |
| [x]       | THEME — Thèmes                     | Clair/sombre/système persistants                        | Smoke Electron et stories Quasar : préférences conservées, thème système explicite.                                                                                                                 |
| [x]       | A11Y — Accessibilité               | Clavier, focus, contraste et réduction des animations   | Preuves Quasar : smoke Electron Axe/clavier clair/sombre, stories de composants réels et contrôle de contraste ; aucune preuve d’identité externe substituée.                                       |
| [x]       | STORIES — Storybook                | Composants Quasar réels et états synthétiques           | Historique : 44 stories × FR/EN clair/sombre ; chargement, vide, erreur, progression et résultat caméra.                                                                                            |
| [x]       | ASYNC — Chargements                | Lectures progressives, erreurs et réponses obsolètes    | Tests camera-reader/session/cancellation, formulaires et stories ; cache indiqué, brouillons conservés, lecture annulée ne remplit pas le cache.                                                    |
| [x]       | ROBOTS — Non-indexation            | Portail et asset non indexables                         | Tests du portail et contrôle proxy de l’hôte asset Quasar : HTML/statique/erreurs noindex, absence de sitemap indexable. Sans objet pour le bureau hors ligne.                                      |
| [x]       | ASSETS — Design privé              | Protéger tout asset.quasar.doublemart.fr                | Contrôles historiques propres à cet hôte : pages/fichiers/archives/Storybook/iframes, refus anonyme/tiers et origine directe. Le total des autres hôtes n’est pas une preuve Quasar supplémentaire. |
| [x]       | VITALS — Web Vitals                | Mesures standard du portail uniquement                  | LCP/INP/CLS du portail dans les contrôles navigateur historiques ; aucune donnée caméra ni mesure native transmise.                                                                                 |
| [x]       | VIEWS — Navigation                 | Une vue web par document du portail                     | Le portail utilise le comptage de document ; ses contrôles web ne revendiquent pas la navigation des autres applications. Aucune vue native collectée.                                              |
| [x]       | METRICS — Collecte                 | Collecte du portail bornée et abandonnable              | Transport web sans contenu métier, limites et panne collecteur contrôlées historiquement sur le portail. Aucun collecteur caméra.                                                                   |
| [x]       | COST — Coût                        | Coût observé, sans promesse de coût nul                 | Mesures locales de lectures/annulations dans finalisation-validation.md ; coût web historique limité au portail. Aucune garantie VPS ou caméra réelle.                                              |
| [x]       | REPORTS — Rapports                 | Rapports techniques Quasar avec source/date/SHA         | Rapports CI/audit Quasar distingués de publication et déploiement ; jobs privilégiés séparés des PR non fiables. Envoi public non configuré.                                                        |
| [x]       | STATUS — États techniques          | Résultats locaux honnêtes et états techniques distincts | Tests addressing/session et stories : envoyé, vérifié, incertain, erreur et annulation. L’affichage administratif partagé ne qualifie pas le runtime natif.                                         |
| [x]       | CI — Validation                    | Validation et fabrication natives historiques           | Run et commit construits dans retained-artifacts.json ; contrôles types/lint/tests/audits, trois OS, packaging sans publication. Nouveau rattachement CI séparé ci-dessus.                          |
| [x]       | BRANCH — Protection effective      | Protection de main Quasar conservée                     | PR de préparation distincte de main, contrôle requis et absence de force-push ; aucune fusion ni suppression de branche principale.                                                                 |
| [x]       | ARTIFACT — Artefacts               | Paquet/image et checksum réellement retenus             | retained-artifacts.json et portal-artifact.json : sources construites, archives et hashes historiques. Aucune publication déduite de leur fabrication.                                              |
| [x]       | DELIVERY — Livraison               | Préparer les paquets natifs et le portail               | Paquets historiques validés ; image du portail chargée sans reconstruction. Installation utilisateur et nouveau laboratoire restent distincts.                                                      |
| [x]       | COMPOSE — Compose                  | Compose seulement pour portail et services web          | Portail Quasar et asset intégrés au proxy partagé ; Quasar natif ne dépend pas de Docker pour fonctionner hors ligne.                                                                               |
| [x]       | BACKUP — Sauvegarde                | Sauvegarde/import natif distincts de l’exploitation web | Tests avec données synthétiques isolées ; portail sans base métier. Les 12 volumes + PostgreSQL des services partagés ne sont pas le backup natif Quasar.                                           |
| [x]       | RESOURCES — Ressources             | Distinguer bureau, relais et portail                    | Ressources et arrêts du relais exercés en loopback ; mesures du portail limitées au laboratoire, sans garantie VPS ni débit de caméra réelle.                                                       |

## Fonctionnalités main intégrées — preuves historiques

- [x] Commit `538a8c7` intégré, conflits résolus ; version réunie validée dans le run natif 41718943481.
- [x] Bibliothèque Box, import CSV/XLSX/XLS/ODS et formules/volumes refusés — tests Box, workbook-archive et worker Electron.
- [x] Associations caméras et changement de Box sans fuite de contexte/brouillon — tests Box library, simulation et Electron isolé.
- [x] Connexion automatique opt-in chiffrée, basic_text refusé, aucun secret renderer — tests auto-login et smoke Electron.
- [x] Conflits IP : double découverte, identité, confirmation des IP temporaires — tests addressing-conflicts ; aucune caméra réelle contactée.
- [x] Adressage interrompu/incertain : aucune réécriture automatique ; reprise explicite — tests addressing/session.
- [x] Progression et résultat par caméra : 44 stories × FR/EN clair/sombre, Axe/clavier et scénarios Electron.
- [x] Modes de signature explicités : Windows/Linux/DMG non signés ; application macOS ad hoc vérifiée par codesign, sans signature de distribution ni notarisation. Preuve historique dans docs/retained-artifacts.json.
- [x] Electron et go2rtc inclus dans le contrôle des composants distribués — `audit:distributed` bloquant, rebuild go2rtc corrigé, OSV et govulncheck du 3 novembre sans avis connu ; 22 tests RTSP/superviseur.
- [ ] Matériel réel : externe, caméra et autorisation nécessaires.

## Interventions extérieures restantes

- [ ] Mise en service du portail et de l’espace asset : serveur, DNS/TLS, contrôle d’accès et éventuelle transmission des rapports ; aucune publication ou configuration publique effectuée ici.
- [ ] Caméras autorisées et machines de recette des installateurs ; certificats de signature/notarisation pour distribution. Windows/Linux/DMG non signés, app macOS ad hoc uniquement.
