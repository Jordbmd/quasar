# Consolidation V1 — bilan du 27 octobre 2026

Ce document décrit la consolidation initiale, avant les changements d’identité visuelle et de suivi des opérations. Depuis ce bilan, l’identité **Prisme** a été intégrée avec 275 assets et les bilans d’adressage/profil sont persistants. La publication Git a été demandée explicitement après ces travaux ; les mentions « aucun commit/push » ci-dessous décrivent uniquement l’étape initiale. Voir aussi la [recette matérielle actualisée](RECETTE-MATERIELLE.md).

**Mise à jour après publication :** la validation distante du commit `2f86f95` a réussi nativement sur macOS, Linux et Windows, avec lancement Electron isolé, catalogue/Axe et construction de paquets autonomes. La suite compte 224 tests (223 sous Windows, le contrôle de permissions POSIX étant non applicable). Les problèmes de verrou npm, de format multiplateforme, de fausse modification pendant l’hydratation du formulaire et de synchronisation du test de thème ont été corrigés. La régression du formulaire a été reproduite sur l’ancien code puis vérifiée sur le correctif. Les workflows CI/CD et l’historique GitHub Actions ont ensuite été supprimés à la demande du mainteneur ; la validation reste locale. La [matrice des plateformes](PLATEFORMES.md) fait foi pour l’état actuel. Aucune nouvelle validation matérielle ni mise à jour de firmware n’a été réalisée.

Travail local sur `main`, à partir de `6c572ca2b52fa0991b824ad00bfdde0bf8f44703`. Répertoire initial propre. Aucun commit, push, reset Git, nettoyage destructif ou publication. Aucun changement de nom, logo, licence ou visibilité. Aucun matériel connecté ou commandé pendant cette consolidation. L’application installée dans `~/Applications/Quasar.app` n’a pas été remplacée.

## Problèmes prioritaires et corrections

| Problème confirmé | Correction | Limite restante |
| --- | --- | --- |
| Linux et Windows renvoyaient un système réseau non pris en charge | Contrat commun, adaptateurs JSON iproute2/PowerShell, route liée à l’adresse source et à l’interface, erreurs explicites | Contrats exécutés sur Mac ; validation native des deux OS encore nécessaire |
| Une erreur d’inventaire pouvait interrompre la remontée d’état | NetworkGuard invalide le contexte, publie un état non prêt et laisse l’application consultable | Disponibilité des outils système requise, sans installation automatique |
| Validation IPC et règles de concurrence dispersées | Schémas partagés, union discriminée du dispatch, événements typés et contrôleur testable ; états/journaux lisibles pendant une opération exclusive | Les payloads firmware bruts restent partiellement typés à la frontière existante |
| Lectures progressives et sélection difficiles à suivre | CameraReader possède les abonnements/générations ; brouillons préservés pour les champs déjà modifiés ; état cache/partiel/relu visible | Une perte d’identité réseau impose l’abandon explicite du brouillon ; aucune restauration sur une autre cible |
| Données liées au dossier du projet et lanceur non autonome | Chemins utilisateur Electron, migration par copie sans écrasement, packaging autonome séparé | Migration réelle des données utilisateur volontairement non lancée pendant les tests |
| Relais supposé macOS, téléchargement insuffisamment vérifié, arrêt POSIX supposé universel | Binaires OS/architecture épinglés et empreintes officielles vérifiées ; .exe, superviseur POSIX/Windows et transport HTTP Node portable | Arrêt natif Windows et réseau physique à vérifier sur Windows |
| Commandes avancées envahissantes et liste presque invisible au zoom | Actions avancées repliées ; contrôles regroupés à largeur réduite ; hauteur utile de liste contrôlée automatiquement | La disposition à zoom élevé reste volontairement plus compacte |
| `0`, `false` et chaîne vide assimilés à une absence | Formatteur explicite commun, tests dédiés | Les objets constructeur historiques gardent leurs normalisations spécialisées |

ONVIF **0.8.3** et go2rtc **v1.9.14** conservés. Les adaptations HTTP/XML/Media1/Media2, le mode jour, l’OSD web/ONVIF, l’adressage et les protections du reset ne sont pas remplacés. Electron reçoit seulement le correctif **44.9.3**, sans remplacement automatique de l’exécutable installé.

## Responsabilités réorganisées

- `ipc-controller` : validation, retour structuré et exclusivité, séparés des objets Electron.
- `shared/ipc-schemas` et `shared/ipc` : contrat vérifié à la compilation, table des événements et politique complète des actions.
- `platforms/*` : commandes propres aux OS, indépendantes des opérations caméra.
- `storage` : chemins et migration ; `vendor-transport` : HTTP constructeur ; `sync-clock` : opération horaire préservée.
- `renderer/pages` : Diagnostic et Paramètres ; `camera-reader` : demandes progressives et réponses tardives ; `camera-form-values` : valeurs initiales du formulaire ; `format` : affichage sans confusion avec l’absence.

Le service conserve les sessions, l’identité et l’orchestration. Le transport ONVIF reste conséquent : les nombreuses adaptations firmware justifient une extraction progressive, testée, plutôt qu’une réécriture générale. Aucun store, bus, framework d’injection ou moteur d’états ajouté. Quelques reformattages rendent les nouveaux contrôles Prettier applicables à tout le code ciblé.

Voir [la carte des chemins et des tests](ARCHITECTURE.md), [les compatibilités sensibles](COMPATIBILITE-FIRMWARE.md) et [l’outillage avec licences et alternatives](OUTILLAGE.md). Outils retenus : dependency-cruiser, Knip, ESLint/typescript-eslint/hooks, electron-builder et fflate, tous en développement. Repomix non installé ; aucun paquet choisi sur le nom imprécis « Graphify » ; aucune transmission du dépôt à un indexeur.

## Validation réellement effectuée

Référence avant modification : `npm test`, `npm run build`, `npm run test:contrast`, `npm run test:forms` réussis : **200 tests dans 18 fichiers**, compilation, **130 contrôles de contraste** et parcours simulés.

| Commande / contrôle | Résultat final local |
| --- | --- |
| `npm run validate:software` | Réussi : types stricts, lint, format, graphe, Knip, tests, build, contrastes et formulaires ; 220 tests au moment de cette exécution |
| `npm test` après ajout des deux derniers cas de défaillance vidéo | **222 tests réussis, 26 fichiers**, 24,49 s ; types revérifiés |
| `npm run test:ui` | Electron natif, stockage isolé, réseau désactivé : démarrage, IPC retirées refusées, renderer sans Node, navigation, clavier/Axe et thème persistant |
| `npm run build-storybook` / `npm run test:stories` | 32 stories × 2 thèmes, rendu, Axe, modal/clavier, thèmes système/manuels ; aucun accès externe |
| `npm run test:visual` | 12 comparaisons réussies ; reflow 1100 et 724 px, actions visibles et liste utilisable |
| `npm run test:brand` | 98 assets vérifiés, dimensions/transparence/cercle central/ICO/ICNS ; dessins inchangés |
| `npm run setup:video` | go2rtc macOS arm64 officiel téléchargé et vérifié contre l’empreinte épinglée |
| `npm run package:dir` | Paquet autonome macOS arm64 produit et signé ad hoc, sans notarisation ni publication |
| `QUASAR_PACKAGED_EXECUTABLE=… npm run test:ui` | Paquet autonome réellement lancé puis relancé ; app.asar, relais embarqué, stockage temporaire, deux thèmes, clavier/Axe et persistance vérifiés |
| `git diff --check` | Aucun défaut d’espacement |

Les intégrations HTTP/SOAP/RTSP utilisent uniquement loopback ; WS-Discovery est injecté. Le vrai relais est testé pour le démarrage/arrêt, TEARDOWN et fermeture après fin du pipe parent. Les réponses lentes, A → B → A, annulations, erreurs partielles, écritures incertaines, OSD et profils sont couverts par les tests existants et étendus. La migration est testée avec priorité à la destination, reprise après interruption, source intacte et exclusion des caches/sondes.

Knip n’annonce aucune dépendance, fichier ou export inutilisé ; il conserve quatre conseils de configuration non bloquants (entrées redondantes détectées par ses plugins et extension MDX sans source). Storybook signale la taille de certains chunks du catalogue. electron-builder signale l’auteur de paquet absent et une référence transitive dupliquée ; aucune de ces alertes n’est une validation de distribution signée.

### Échecs rencontrés et distinction des causes

- **Préexistant** : le test Electron cherchait encore « Configuration des caméras », alors que le commit de départ affichait déjà « Caméras ». Sélecteur corrigé.
- **Préexistant** : quatre empreintes de SVG monochromes ne correspondaient plus aux fichiers suivis. L’identité avec les fichiers et le manifeste de HEAD a été vérifiée ; seules leurs métadonnées d’intégrité ont été corrigées. Les 98 assets passent ensuite.
- **Références visuelles anciennes** : huit captures ne reflétaient plus l’écran actuel, dont l’accès au profil déjà présent dans le code de départ, ni les nouveaux regroupements. Les images ont été inspectées avant remplacement. Les quatre captures de composants inchangées restent identiques.
- **Environnement** : une exécution sandboxée refusait l’écoute locale avec `EPERM 127.0.0.1`. La même validation relancée avec l’autorisation des serveurs loopback réussit. Des timeouts observés pendant des tâches simultanées n’ont pas été reproduits lors des exécutions isolées ; aucun délai n’a été augmenté.
- **Régression introduite puis corrigée** : la préservation des brouillons gardait une intention OSD après succès et pouvait la rejouer. Chaque intention est maintenant effacée seulement après sa confirmation ; les cycles désactivation/restauration repassent.
- **Régression visuelle détectée puis corrigée** : l’ajout des actions réduisait la liste à une bande au zoom élevé, et une règle de compacité masquait le logo. Disposition corrigée, minimum de liste testé et captures réinspectées.

Aucun test n’a été supprimé ou désactivé pour obtenir un résultat positif. Aucun délai de test augmenté. Les commandes de validation sont disponibles localement ; aucun workflow CI/CD n’est conservé dans le dépôt.

## Interface : captures représentatives

Captures issues des fixtures ; aucune image de caméra réelle. L’identité, les surfaces unies et les thèmes sont conservés. Les parcours couvrent aussi 180 appareils, recherche/tri, lecture lente, erreurs partielles, adressage, reset, profil, résultats, historique et export.

Les captures représentatives sont produites localement dans `test-results/camera-config-light-SIMULATION.png`, `test-results/camera-config-dark-SIMULATION.png` et `test-results/visual/reflow-724-bottom.png`. Les captures et rapports sous `test-results/` sont ignorés par Git et régénérables. Les références inspectées sous `tests/visual-baselines/` sont versionnées.

## Plateformes et données

La [matrice détaillée](PLATEFORMES.md) sépare implémentation, compilation, exécution, tests logiciels et matériel : **macOS arm64 exécuté ; Linux x64 et Windows x64 implémentés et testés par contrats sur Mac, sans exécution native ici**. Les mappings macOS x64/Linux arm64 sont préparés seulement. Aucune validation matérielle nouvelle, sur aucun OS.

Les profils, préférences, sauvegardes et journaux sont copiés vers le dossier utilisateur `sezaam-camera-tool`, sans écraser la destination ni supprimer `.runtime`. Le paquet autonome ne dépend pas du dépôt ; le lanceur historique reste disponible. Sa substitution et les autorisations réseau du nouveau paquet nécessitent leur propre essai. Les données réelles n’ont pas été migrées pendant les tests.

## À vérifier ensuite avec du matériel

La [recette matérielle](RECETTE-MATERIELLE.md) détaille les étapes : découverte et route/source sur chaque OS, branchements et VPN ; compatibilité firmware et relecture de chaque réglage ; image décodée et latence A → B → A ; LED réellement allumées et OSD réellement présent/absent ; conflits/adressage et reset sur appareils de test dédiés ; fermeture forcée sans relais restant. La réception d’octets vidéo et une relecture de paramètres ne prouvent ni la qualité visuelle ni l’allumage physique.
