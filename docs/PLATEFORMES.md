# Plateformes, stockage et distribution

État de consolidation au 27 octobre 2026. Aucun hub, switch ou caméra utilisé pendant cette validation. Les résultats matériels historiques de la V1 ne valident pas les nouveaux adaptateurs système.

## Matrice de validation

| Cible | Implémenté | Compilé | Exécuté | Tests sans matériel | Matériel |
| --- | --- | --- | --- | --- | --- |
| macOS arm64 | Oui, chemin réseau existant conservé | TypeScript, UI et paquet autonome, localement et en CI | Node/Electron/go2rtc natifs | Tests locaux et CI : interfaces simulées, intégrations loopback, UI isolée, catalogue/Axe | Non testé pendant cette consolidation |
| Linux x64 | Adaptateur iproute2, transport Node, superviseur POSIX, packaging | TypeScript, UI et paquet autonome en CI Ubuntu | Node/Electron/go2rtc natifs en CI | Contrats injectés, loopback, UI sous Xvfb, catalogue/Axe | Non |
| Windows x64 | PowerShell, transport Node, superviseur taskkill, .exe, packaging | TypeScript, UI et paquet autonome en CI Windows | Node/Electron/go2rtc natifs en CI | Contrats injectés, loopback, UI isolée, catalogue/Axe ; contrôle POSIX des permissions non applicable | Non |
| macOS x64 / Linux arm64 | Sélection de binaire préparée ; même code système | Pas de paquet produit ici | Non | Table de sélection et empreintes testées | Non |
| Windows arm64 / autres | Non ciblé ; installation du relais refusée explicitement | Non | Non | Rejet des cibles inconnues testé | Non |

La validation distante du 27 octobre 2026, sur le commit `2f86f95`, a réussi sur les trois OS : contrôles statiques, tests, build, contrastes, parcours simulés, catalogue/Axe, lancement Electron isolé et `package:dir`. La suite compte 224 tests : tous passent sur macOS/Linux ; 223 passent sous Windows avec le seul contrôle POSIX des permissions explicitement non applicable. À la demande du mainteneur, les workflows CI/CD, leurs exécutions, rapports et caches GitHub Actions ont ensuite été supprimés et Actions désactivé pour ce dépôt. Les commandes de validation restent disponibles localement. Les tests matériels restent distincts. Aucun installateur, signature de distribution ou release n’a été publié. Le [bilan initial](CONSOLIDATION-V1.md) conserve le contexte historique.

## Réseau du poste

- macOS : networksetup/ifconfig et route/ping/arp système existants, adresse source Ethernet conservée.
- Linux : nécessite **iproute2** (`ip` dans PATH), JSON `ip -j`, et sysfs `/sys/class/net`. Les interfaces physiques Ethernet sont distinguées des interfaces Wi-Fi et virtuelles. Une commande absente ou refusée produit un état explicite ; aucune installation automatique ni élévation.
- Windows : Windows PowerShell système et modules **NetAdapter / NetTCPIP**. Les commandes JSON utilisent les propriétés numériques CIM plutôt que les libellés traduits. Les identifiants d’interface sont des entiers validés ; les noms lisibles peuvent être Unicode. Une installation Windows dépourvue de ces modules reste consultable, avec erreur réseau explicite.
- Plusieurs Ethernet actifs, plusieurs IPv4 candidates, disparition d’interface, route introuvable ou permission refusée ne sont jamais présentés comme un chemin vérifié. Les réglages du poste restent manuels.
- L’interrogation des voisins n’est pas un inventaire exhaustif : un équipement silencieux peut manquer. Les conflits IP imposent toujours une isolation physique avant écriture.

Aucun curl supposé sur Linux/Windows : le transport HTTP constructeur Node lie la socket à l’IPv4 source, borne temps/taille, conserve le corps et les en-têtes requis, gère l’annulation et ne suit pas les redirections. Le transport curl macOS est conservé pour sa compatibilité firmware caractérisée.

## Stockage et migration

Racine : `app.getPath("appData")/sezaam-camera-tool`, identifiant historique inchangé.

| Données | Destination sous cette racine |
| --- | --- |
| Profil local | camera-defaults.json |
| Historique profil / resets / sauvegardes web | profile-journal/ |
| Sauvegardes OSD / réseau | osd/ et backups/ |
| Préférences, stockage local Chromium et ses caches | electron/ |
| Logs Electron | logs/ |
| Configuration temporaire du relais, sans identifiants | temporary/ |

Les ressources et binaires du paquet sont en lecture seule ; aucune écriture dans app.asar ni dans l’application installée. Le profil métier embarqué ne remplace jamais un profil local.

Les nouveaux journaux demandent le mode POSIX `0600` et leurs dossiers `0700`. Ce contrôle de permissions concerne macOS et Linux : [Node ne distingue pas propriétaire, groupe et autres sous Windows](https://nodejs.org/api/fs.html#file-modes). Sous Windows, la protection dépend des ACL du dossier utilisateur ; Quasar ne les modifie pas et le test POSIX ne constitue pas une validation des ACL. Les tests de persistance, de reprise après interruption et de validation des chemins s’exécutent sur les trois systèmes.

1. Quitter l’ancienne application avant de lancer la nouvelle version ; ne pas faire fonctionner simultanément deux versions sur les mêmes données.
2. Depuis le dépôt ou l’ancien lanceur, la migration lit automatiquement `<projet>/.runtime`. Elle copie seulement les données durables connues et les préférences Chromium ; caches, sondes, captures et verrous ne sont pas importés.
3. Un paquet autonome ne peut pas deviner l’emplacement de l’ancien dépôt. Pour le premier démarrage, indiquer le chemin absolu de `.runtime` via **QUASAR_LEGACY_RUNTIME**, ou lancer d’abord la nouvelle version depuis le dépôt pour effectuer la migration vers le dossier commun. Cette variable peut ensuite être retirée.
4. Chaque fichier est publié après copie complète, sans écraser une destination existante. La source reste intacte. Une interruption avant le marqueur permet de reprendre la copie ; après succès, `migration-v1.json` empêche de réimporter un historique déjà purgé. Les liens symboliques ne sont pas importés. Une erreur de migration est signalée, sans effacer les données.
5. Un retour vers l’ancien code retrouve sa `.runtime` intacte ; les modifications faites après migration ne sont pas synchronisées vers cette ancienne copie. Conserver les deux dossiers pour un éventuel retour arrière.

Les tests utilisent un dossier temporaire dédié via SEZAAM_TEST_USER_DATA et n’importent jamais les données réelles. Le mode sans réseau exige également ce dossier isolé.

## Packaging

Depuis le 28 octobre 2026, les commandes `package:mac`, `package:win`, `package:linux` et `package:all` préparent aussi des installateurs DMG, NSIS et AppImage. Leur mode de génération, leurs architectures et leurs limites de signature sont décrits dans [Distribution](DISTRIBUTION.md). Les résultats de la matrice ci-dessus concernent les paquets autonomes validés le 27 octobre, avant l’ajout de ces installateurs.

`npm ci`, `npm run setup:video`, puis `npm run package:dir`, sur l’OS cible avec Node 24. Les commandes npm communes n’utilisent pas d’affectation d’environnement propre au shell POSIX. Les scripts `launcher:*` restent volontairement propres au lanceur macOS de développement.

Un seul packager, electron-builder 26 : sorties dans `release/`, dépendances de développement exclues, aucune publication. Le contrôle après assemblage vérifie le relais, ses métadonnées OS/architecture et le superviseur. La sélection go2rtc v1.9.14 est épinglée ; les empreintes SHA-256 attendues viennent des métadonnées de la release officielle, pas du fichier juste téléchargé. Les archives sont vérifiées avant extraction du seul exécutable attendu.

Le lanceur existant `~/Applications/Quasar.app` reste lié au dépôt et n’est pas remplacé. Le nouveau paquet macOS est autonome, signé ad hoc, avec bundle ID et UUID Mach-O propres à Quasar. Il n’est **pas notarié** et son autorisation réseau réelle reste à tester. Les paquets Windows/Linux ont été construits sur leurs runners GitHub ; la signature Windows, les installateurs et les mises à jour automatiques ne font pas partie de cette validation. Le lancement Electron en CI se fait depuis les sources compilées ; il ne remplace pas une recette utilisateur du paquet distribué.

Le superviseur POSIX arrête le groupe du relais ; sous Windows il utilise taskkill sur son propre arbre de processus, sans demander les droits administrateur. La fermeture du pipe parent et la libération du port par le vrai relais sont testées nativement sur les trois OS. L’arrêt forcé de l’application empaquetée et les scénarios matériels restent à vérifier séparément.
