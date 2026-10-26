# Quasar

Application locale macOS de configuration et de diagnostic de caméras IP ONVIF : **Caméras**, **Diagnostic**, **Réseau**, **Profil Sezaam** et **Paramètres**.

## Installer depuis le dépôt

Prérequis : macOS et Node.js 22.12+ ou 24.

```sh
git clone https://github.com/Jordbmd/quasar.git
cd quasar
npm ci
npm run setup:video
npm run launcher:install
```

Le dépôt étant privé, le clonage nécessite un accès GitHub autorisé. Le lanceur est installé dans `~/Applications/Quasar.app`. Pour mettre à jour une installation existante, récupérer les changements puis relancer `npm ci` et `npm run launcher:install`, après avoir quitté Quasar.

Le [profil Sezaam enregistré](config/sezaam-profile.json) est intégré à la compilation et utilisé lorsqu’aucun profil local n’existe. Il contient les 52 réglages, dont la résolution maximale disponible. Les modifications faites dans l’application restent dans `.runtime/camera-defaults.json` et sont prioritaires : une mise à jour ne les écrase pas. Aucun réglage n’est envoyé aux caméras au démarrage.

Les journaux, sauvegardes, captures matérielles, dépendances, binaires téléchargés et applications compilées sont exclus de Git. Pour partager une nouvelle version du profil, reporter uniquement sa configuration dans `config/sezaam-profile.json`, puis compiler et tester ; ne pas ajouter le dossier `.runtime/` au dépôt.

## Ouvrir sans Terminal

Double-cliquer sur **Quasar.app**, installé dans `~/Applications/`. L’application est enregistrée auprès de macOS pour être retrouvée par son nom. Elle ouvre la version compilée et ramène au premier plan une session déjà ouverte. Elle peut être glissée dans le Dock. Elle dépend du dossier du projet, de `dist/` et de `node_modules/` : conserver ces fichiers ensemble. Le paquet possède une signature locale ad hoc vérifiée ; il n’est ni autonome ni notarié pour la distribution.

Au premier démarrage, autoriser l’accès au dossier Documents contenant le projet, puis l’accès au **réseau local** lors de la recherche de caméras. Si la première recherche échoue pendant l’affichage de l’autorisation, cliquer de nouveau sur **Détecter** après l’avoir acceptée. L’autorisation se trouve dans Réglages Système → Confidentialité et sécurité → Réseau local → **Quasar**. En mode développement seulement, macOS peut afficher **Electron**.

Le générateur donne au binaire principal une identité Mach-O propre à Quasar avant de le signer. Cela évite la collision avec le binaire Electron d’origine dans le suivi des autorisations réseau de macOS. L’identité reste stable lors d’une reconstruction avec la même version d’Electron. Le générateur prend en charge les exécutables Mach-O 64 bits little-endian ; un autre format est refusé explicitement.

Le thème clair ou sombre est accessible en haut à droite et conservé entre les lancements. Les polices Sora, Inter et JetBrains Mono sont locales ; aucun téléchargement de police pendant l’utilisation.

## Utilisation

1. Configurer si nécessaire le réseau du Mac dans les Réglages Système, puis brancher la caméra et son alimentation PoE.
2. Ouvrir Quasar : la connexion Ethernet du hub est détectée automatiquement, y compris après branchement. Relier les caméras alimentées en RJ45 au hub, directement ou via un routeur/switch. Aucun choix de réseau n’est proposé et le Wi-Fi n’est pas utilisé pour les caméras.
3. Cliquer sur **Se connecter** en bas de la barre latérale et saisir une fois les identifiants communs aux caméras. Sans caméra déjà détectée, cette action lance la découverte Ethernet. Les caméras détectées ensuite, ou ajoutées par IP, utilisent la même session. Sélectionner une caméra pour afficher ses paramètres ; revenir sur une caméra ne redemande pas le mot de passe.
4. L’aperçu démarre automatiquement à la sélection, avant la lecture complète des réglages. **Arrêter** coupe le flux, **Lire** le relance. Le profil le plus léger est choisi par défaut. La page **Paramètres** permet de désactiver la lecture automatique, de choisir le flux principal et de régler le rattrapage du direct. L’aperçu peut être agrandi ; Échap le réduit. Changer de caméra ou de page arrête le flux précédent.
5. Modifier les champs souhaités, puis **Appliquer**. **Annuler** abandonne le brouillon local. Les résultats distinguent une commande envoyée et une relecture effectivement conforme.

Les chevauchements de sous-réseaux sont informatifs. Ils ne bloquent plus globalement l’application. La découverte et les sockets caméra utilisent l’adresse source Ethernet. Sur macOS, le contrôle de route consulte le chemin associé à cette interface (`route get -ifscope`), même si la route générale privilégie le Wi-Fi. Une route absente ou passant par une autre interface reste refusée. Aucun réglage réseau du Mac n’est modifié.

La connexion commune utilise le même compte ONVIF sur chaque caméra, avec au plus trois connexions initiales simultanées. Une caméra qui refuse ce compte affiche sa propre erreur ; les autres restent utilisables. **Réessayer les connexions** retente les caméras indisponibles sans répéter automatiquement les mots de passe refusés à chaque recherche. La fenêtre ouverte depuis la session en bas à gauche permet de remplacer le compte pour toute la session ; **Déconnecter** ferme les connexions et la vidéo. Les identifiants restent en mémoire, sans stockage sur disque. Après un redémarrage de Quasar, ouvrir une nouvelle session. Un débranchement ferme les connexions ; après reconnexion du hub, relancer la détection pour réutiliser la session en cours.

Les paramètres sont chargés lors de la sélection puis conservés pendant la session. **Relire les informations** actualise les données depuis la caméra. L’interface distingue une lecture en cours, un accès refusé et des capacités non prises en charge.

La navigation reste disponible pendant ces lectures. Changer de caméra annule les requêtes de la sélection précédente sans fermer la session commune ; les réponses et erreurs tardives ne remplacent jamais la nouvelle fiche. Le relais termine l’ancienne session RTSP avant d’ouvrir la suivante. Un démarrage vidéo interrompu peut être repris une seule fois, avant toute image, tandis qu’un refus d’identifiants reste explicite et n’est pas répété.

En cas de délai réseau ou de rupture TCP pendant une lecture, Quasar effectue au plus trois tentatives, en contrôlant à nouveau le chemin Ethernet. Les reprises apparaissent dans le diagnostic. Un refus d’authentification et une écriture interrompue ne sont pas répétés automatiquement. Si la caméra reste silencieuse, son erreur demeure visible et les autres caméras restent accessibles.

### Réglages caméra

La liste des caméras occupe la hauteur disponible et reste visible pendant le défilement des réglages à droite. Elle peut être triée par IP croissante, décroissante ou par nom. Le réseau caméra et la vidéo sont suivis d’un panneau OSD sur toute la largeur ; les actions se trouvent à la fin du formulaire. L’état Ethernet détaillé du Mac est regroupé sur la page **Réseau**. Une donnée absente n’est jamais remplacée par une valeur fictive.

- **Réseau caméra** : IPv4 statique ou DHCP, masque, passerelle et DNS. L’aide casier calcule `192.168.1.(casier + 10)` pour les casiers 1 à 244 ; saisie manuelle possible. Les modifications réseau demandent une confirmation native et contrôlent l’identité, la découverte et les voisins Ethernet avant l’envoi. L’isolation physique est nécessaire pour résoudre une IP partagée, pas pour chaque caméra dont l’identité est unique. Le contrôle de conflits ne prouve pas qu’un équipement silencieux est absent. Un passage en DHCP nécessite un serveur DHCP ; une réponse ONVIF ne garantit pas qu’une nouvelle adresse a été attribuée.
- **Vidéo** : profil principal ou secondaire, résolution, FPS, codec, débit, qualité, intervalle I-Frame et CBR/VBR selon les capacités effectivement retournées. Media1 et Media2 sont interprétés séparément ; les FPS discrets Media2 sont respectés. Les champs et extensions non modifiés sont conservés dans le XML. Un encodeur peut être partagé entre plusieurs profils de la même caméra. Une combinaison insuffisamment documentée par l’appareil est refusée avec un message.
- **OSD** : GetOSDs lit les incrustations ; GetOSDOptions consulte les options. Les paramètres texte, date/heure, position, coordonnées et taille utilisent SetOSD en conservant les autres propriétés et extensions. **Activer l’OSD** / **Ajouter une incrustation** utilise CreateOSD, uniquement avec une source, des options et une limite de capacité vérifiées. Les valeurs non exposées par la caméra ne sont pas inventées. **Désactiver l’OSD**, puis **Appliquer**, utilise DeleteOSD : il s’agit d’une suppression réelle dans la caméra, pas d’un masquage dans le lecteur. La relecture vérifie l’absence des objets visés et la conservation des autres. Les objets complets sont sauvegardés localement avant écriture sous `.runtime/osd/`, avec une identité caméra et des permissions privées. **Activer l’OSD sauvegardé**, puis **Appliquer**, utilise CreateOSD et une nouvelle relecture ; la caméra doit accepter cette commande. Un objet existant différent de la sauvegarde bloque la restauration automatique pour éviter les doublons.

Une sauvegarde OSD conserve le point de départ d’une série d’opérations. Après restauration vérifiée, les nouveaux tokens attribués par la caméra deviennent la référence, afin de permettre plusieurs cycles sans duplication. Les anciennes sauvegardes réseau du Mac dans `.runtime/backups/` sont laissées intactes, mais l’application ne les utilise plus et n’effectue aucune restauration système.

**Ouvrir l’interface web** reste disponible pour les fonctions non prises en charge. Le navigateur système utilise son propre routage. Le profil Sezaam utilise aussi un adaptateur web identifié sur les appareils du parc, notamment pour l’éclairage, l’image et les interrupteurs globaux décrits ci-dessous.

### Diagnostic

Choisir une caméra sur la page Diagnostic et lancer le test. Les contrôles couvrent TCP, ONVIF, authentification, identité, configuration réseau, encodage, OSD, firmware, données vidéo et conflits détectables. Les états sont **Réussi**, **Échec**, **Non pris en charge** et **Non testé**.

Le test vidéo atteste la réception de données média par le relais, pas la fluidité ni la qualité du décodage visuel. Le diagnostic ne modifie aucun réglage caméra. Les journaux sont horodatés, bornés à 500 événements, copiables et exportables en JSON. Les mots de passe et URL d’authentification sont masqués. Aucun résultat simulé n’apparaît dans l’application normale.

## Sécurité et fonctionnement local

Electron conserve l’isolation du contexte, la sandbox, un renderer sans Node.js, une CSP et le refus des fenêtres et navigations externes. L’IPC vérifie l’appelant et valide les paramètres via Zod. Les identifiants restent en mémoire ; ils ne sont pas enregistrés dans les préférences.

Le backend vérifie la route, l’interface et l’identité caméra avant les écritures. Un changement réseau ferme les connexions existantes. La connexion Ethernet est relue toutes les cinq secondes ; les connexions caméra et flux actifs sont contrôlés. Ce contrôle applicatif n’est pas une isolation réseau du noyau.

Le relais go2rtc officiel expose uniquement des points d’accès sur `127.0.0.1` avec des chemins aléatoires. Il reçoit les URI caméra en mémoire. Les fichiers temporaires et arguments de processus ne contiennent pas de mot de passe caméra. Un superviseur arrête le relais si Electron disparaît. Les écritures ne sont pas répétées automatiquement après un délai dépassé ; une reconnexion et une relecture sont nécessaires en cas de résultat incertain.

Aucun compte, service cloud, abonnement, dépôt Git, commit ou push n’est nécessaire. L’application ne contient plus de commandes de modification des réglages réseau macOS.

Le lecteur masque les commandes de fichier vidéo (durée, recherche temporelle). Le mode direct vise un tampon de 250 ms et rattrape au-delà de 1,2 s ; ces valeurs concernent uniquement le tampon local, pas le délai de capture et d’encodage de la caméra. Les préférences sont locales et ne changent pas les profils d’encodage des appareils.

Les paramètres arrivent progressivement par bloc : une lecture OSD lente ne masque plus le réseau ou la vidéo déjà lus. Les blocs vérifiés restent en mémoire pendant la session, y compris après un changement de caméra avant la fin du chargement ; le retour reprend les blocs manquants ou en erreur. « Relire les informations » force une nouvelle lecture. Les réponses d’une sélection annulée sont ignorées et l’arrivée d’un autre bloc ne réinitialise pas les modifications en cours.

## Développement et vérification

Pour installer les dépendances et le binaire go2rtc : Node.js 22.12+ ou 24, `npm ci`, puis `npm run setup:video`. Seule l’installation initiale nécessite Internet. Le téléchargement du relais vérifie le SHA-256 de la publication officielle.

```sh
npm run dev            # Interface de développement locale
npm run launcher       # Compilation puis régénération du lanceur
npm test               # Unités et intégrations SOAP / relais locaux
npm run test:contrast  # Contrastes des deux thèmes
npm run test:ui        # Application Electron réelle, sans caméra
npm run test:forms     # Formulaires avec simulation explicitement identifiée
```

Les tests d’intégration utilisent uniquement la boucle locale, jamais une caméra réelle. Le parcours de formulaires est isolé dans un navigateur de test et marqué **SIMULATION — TEST AUTOMATISÉ**. Le test Electron lit les interfaces du Mac sans les modifier. Les tests de sockets et d’interface graphique requièrent les permissions locales correspondantes. Les résultats et captures sont dans `test-results/` ; les captures `*SIMULATION*` ne constituent pas une preuve de compatibilité matérielle.

L’accessibilité est contrôlée avec Axe et un calcul automatisé des contrastes : texte normal ≥ 4,5:1, contrôles et focus ≥ 3:1. Ces vérifications automatisées ne constituent pas une certification WCAG complète.

## Architecture

- `src/renderer/` : React, pages, formulaires, lecteur MSE, tokens des thèmes.
- `src/shared/` : contrat IPC et interprétation des capacités vidéo communes.
- `src/main/main.ts`, `preload.ts` : Electron, IPC, sécurité et dialogues.
- `platform.ts`, `network.ts` : lecture du réseau macOS et détection automatique de la connexion Ethernet.
- `discovery.ts`, `onvif.ts` : WS-Discovery et transport ONVIF authentifié.
- `service.ts` : ciblage, opérations, relectures et diagnostics.
- `osd.ts`, `encoding.ts` : XML conservé, sauvegarde OSD et modifications ciblées.
- `video.ts`, `scripts/video-supervisor.cjs` : relais et libération des ressources.

## Limites matérielles

macOS arm64 a été exécuté localement. L’interface système conserve une séparation permettant un portage, mais Linux et Windows ne sont pas implémentés. HTTPS ONVIF, découverte IPv6, RTSP UDP, transcodage et flux vers un hôte différent ne sont pas pris en charge. Les changements d’IP statique restent dans le sous-réseau choisi. Un redémarrage demandé par la caméra reste manuel.

**La compatibilité doit être vérifiée sur chaque caméra et firmware du parc.** L’authentification, la découverte, les flux, les écritures réseau/vidéo et la suppression/restauration OSD doivent être confirmés pour chaque firmware. Voir [la recette matérielle](docs/RECETTE-MATERIELLE.md) et [les sources techniques](docs/SOURCES.md).

## Design system Quasar

Voir [la documentation du design system](docs/design-system/README.md) : identité, 98 assets, tokens, composants, Storybook, accessibilité et tests visuels. `npm run storybook` ouvre le catalogue local ; `npm run brand:build` régénère les logos et icônes. Les identifiants techniques historiques restent stables pour préserver les données et autorisations.

## Vérification locale du 19 octobre 2026

La version Quasar compile avec ses trois polices locales et ses SVG. Les tests fonctionnels, d’accessibilité, d’assets et visuels sont décrits dans la documentation du design system ; les rapports courants sont dans `test-results/`. Aucun réglage réseau système ni aucune caméra réelle n’a été modifié pendant la migration.

### Historique : correction de l’autorisation réseau

Le 19 octobre à 19:32, l’application native installée a été fermée puis rouverte depuis le Finder. Une nouvelle recherche sur `en0` a terminé normalement : **0 réponse**, sans `EHOSTUNREACH`. L’autorisation **Sezaam** était activée dans Réseau local à cette date, avant le renommage Quasar. Cette vérification confirme l’envoi autorisé de la recherche, pas la présence ni la compatibilité d’une caméra. Les 67 tests unitaires et d’intégration passent après correction ; compilation et signature du paquet vérifiées. L’adresse IP et les routes du Mac n’ont pas été modifiées.

La correction suit la recommandation Apple concernant l’unicité du UUID de l’exécutable : [TN3179 — Local network privacy, Build-time considerations](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy#Build-time-considerations).

### Ethernet automatique

Le choix manuel de l’interface a été supprimé de l’interface, du contrat IPC et du backend. Seul le raccordement Ethernet du hub est utilisé, en direct ou via routeur/switch. La présence du hub est relue toutes les cinq secondes ; le débranchement ferme les connexions caméra et arrête la vidéo. Sans Ethernet, le Wi-Fi ne prend jamais le relais. Plusieurs connexions Ethernet actives sont signalées comme ambiguës : garder uniquement le hub des caméras branché. L’adressage du Mac reste géré dans les Réglages Système.

Une liaison active sans IPv4 en mode DHCP est signalée comme une attente d’adresse. Une adresse locale `169.254.x.x` affiche un avertissement : la découverte reste disponible, mais l’accès aux caméras dépend de leur adressage et de la route Ethernet. Avec un routeur, vérifier le port LAN et la disponibilité du serveur DHCP ; en liaison directe ou via un switch sans DHCP, l’adresse Ethernet du Mac doit être configurée manuellement dans le sous-réseau de la caméra. L’avertissement disparaît lorsqu’une adresse hors de cette plage est détectée.

## Profil Sezaam — paramètres par défaut

La page **Profil Sezaam → Paramètres par défaut** reprend les 52 champs du profil Sezaam, classés par catégorie et recherchables. Chaque valeur peut être incluse ou exclue du profil. **Enregistrer le profil** conserve les valeurs localement dans `.runtime/camera-defaults.json` ; cette action ne modifie aucune caméra. « Light OFF Sensitivity » correspond à la valeur 36, et « Light ON Brightness » à 1,50.

Les actions **Appliquer à la caméra sélectionnée**, **Appliquer à toutes**, et les raccourcis de la page Caméras ouvrent une vérification préalable. Celle-ci liste les cibles exactes, les valeurs courantes, les changements compatibles et les réglages non applicables. L’envoi ne commence qu’après le bouton d’application de cette fenêtre. Les caméras sont traitées séquentiellement ; chaque groupe est relu, et un résultat incertain arrête les groupes suivants de cette caméra. Un changement de réseau, d’identité, de profil enregistré ou de configuration depuis la vérification empêche l’écriture concernée. Une vérification expire après dix minutes et ne peut être utilisée qu’une fois.

L’application automatique intègre 49 champs par l’API web reconnue sur le parc, plus les deux champs de date/heure via ONVIF et la commande de mode jour. Elle couvre notamment l’image, les gains RGB, les réglages de jour, plusieurs réglages LED, l’encodage principal/secondaire, l’audio, l’OSD, les masques, le stockage et les alarmes mouvement/IO. Les champs doivent exister dans les réponses ; les plages et combinaisons sont contrôlées. Les fonctions ONVIF existantes restent disponibles si l’API web n’est pas reconnue. Les valeurs d’image à 128 ne sont jamais converties arbitrairement ; 3MP nécessite une résolution annoncée compatible. Les attributs non concernés sont préservés et une sauvegarde privée précède chaque écriture web. Désactiver l’OSD inclut les titres personnalisés ; désactiver le stockage local inclut les événements qui écrivent localement.

La synchronisation horaire utilise la date UTC du Mac au moment de l’envoi, en mode manuel, avec le fuseau Paris (règles été/hiver) ou UTC. Le succès exige une relecture UTC à moins de dix secondes ainsi que la confirmation du mode, du fuseau et de l’indicateur d’heure d’été. Une caméra qui ne fournit que son heure locale n’est pas considérée comme vérifiable. Aucun serveur NTP ni Box n’est configuré.

L’onglet **Compatibilité** couvre les 52 champs : tous avec un chemin d’écriture intégré et un contrôle de résultat. DRC, IA globale, perte vidéo, reset usine et obturateur de nuit ont été retirés à la demande de l’utilisateur. Le profil ne dépend d’aucune référence de caméra. Les réponses réelles déterminent les possibilités ; le nom commercial n’est jamais une liste d’autorisation. Voir la [matrice détaillée et les observations matérielles](docs/PROFILE-COMPATIBILITY.md).

**Journal et erreurs** conserve les audits en lecture seule et les applications dans `.runtime/profile-journal/` (50 derniers rapports). Chaque champ indique sa valeur demandée, sa valeur précédente et sa valeur relue lorsqu’elles sont disponibles, avec les étapes d’envoi/relecture et les causes d’erreur. Filtres par caméra/résultat/champ et export JSON. Les états distinguent notamment lecture impossible, incompatibilité confirmée et fonction non automatisée. Les résultats partiels sont conservés champ par champ. Un arrêt est reconnu à la réouverture, sans rejouer automatiquement les écritures. Les sauvegardes web sont conservées séparément dans `.runtime/profile-journal/backups/`.

Validation du 21 octobre 2026 : compilation TypeScript/Vite, 160 tests unitaires/intégration et parcours d’interface simulés (édition, sauvegarde, cible unique, préparation de lot, annulation, bilan partiel, audit, historique, filtres, export, thèmes clair/sombre). Le protocole web a été reconnu sur les cinq caméras. Un essai réel sur 192.168.1.14 a confirmé la luminosité 128 → 129, puis sa restauration à 128. Aucun profil complet n’a été appliqué pendant cette validation ; les autres écritures restent à vérifier sur chaque cible lors de leur application.

La fiche caméra utilise l’interrupteur OSD web quand il est reconnu : activation, texte, date/heure et positions, avec sauvegarde et relecture. Les objets ONVIF restent disponibles pour les autres protocoles. La lecture lance aussi la préparation des LED blanches à 100 %, sans retarder l’apparition du flux. Une erreur d’éclairage apparaît à l’écran et dans les diagnostics ; elle ne coupe pas la vidéo. Arrêter le flux ne commande pas l’extinction des LED.

### Adressage par casier et réponses différées — 26 octobre 2026

**Attribuer les IP**, sous la liste des caméras, prépare une plage `192.168.1.(casier + 10)` avec masque `255.255.255.0`. Choisir le premier casier, vérifier le tableau (tri IP puis identité), puis confirmer le lot. Les identités non connectées, les IP partagées et les cibles déjà observées sont exclues. Le plan est à usage unique et expire après deux minutes ; un changement d’interface ou de session l’invalide. Chaque écriture est suivie d’une vérification d’identité et d’adresse. Le lot s’arrête au premier résultat incertain. Les réglages réseau d’origine et le bilan sont sauvegardés dans le journal local des sauvegardes, sans identifiants.

**Résoudre le conflit** demande de ne laisser branchée que la caméra choisie. Deux découvertes, l’identité authentifiée et les voisins Ethernet doivent concorder avant de lever le blocage. Attribuer une IP unique, puis rebrancher la suivante. Ce parcours ne prétend pas cibler par MAC plusieurs appareils encore branchés avec la même IP. Aucun protocole constructeur de réadressage de niveau Ethernet n’a été identifié ni intégré. La commande [ONVIF SetNetworkInterfaces](https://www.onvif.org/yaml/wsdl-viewer2.php) exige une connexion à l’appareil ; son accusé de réception ne garantit pas une disponibilité immédiate à la nouvelle adresse.

Les écritures web acceptent les réponses HTTP 2xx, dont 202/204, comme accusés de réception uniquement. La réussite exige une relecture correspondante : quatre observations au maximum, avec attentes de 400 ms, 1 s et 2 s si nécessaire. La commande d’écriture n’est jamais renvoyée par ce mécanisme. Les erreurs conservent la caméra concernée et la cause de l’échec. « Réessayer les connexions » peut également recréer une connexion restée incertaine ; la relecture suivante est toujours nécessaire.

Les modifications réseau ne relisent plus les capacités vidéo/OSD ; les changements vidéo ne relisent que l’encodeur et ses options. Une découverte datant de moins de cinq secondes est partagée au sein des contrôles d’écriture, sans supprimer les contrôles d’identité et ARP. Avant une modification, les anciennes lectures de fiche sont annulées avant d’attendre la fin d’une commande d’éclairage déjà envoyée. L’arrivée tardive des capacités vidéo ne réinitialise plus les champs saisis si leurs valeurs n’ont pas changé.

L’éclairage de l’aperçu configure désormais aussi le mode IRCUT manuel (`IrcutMode=3`) lorsqu’il est reconnu, avec LED blanches et intensité manuelle 100 %. Aucune commande NightMode n’est envoyée. La relecture confirme des réglages, jamais la présence physique de lumière. Validation de cette révision : tests réseau et parcours UI simulés ; le matériel étant débranché, l’allumage réel, la latence de bout en bout et le réadressage matériel restent à valider lors du prochain branchement.

### Remise à zéro d’usine groupée — 26 octobre 2026

Sur la page **Caméras**, **Réinitialiser les caméras…** ouvre un parcours séparé du profil Sezaam. **Vérifier les caméras** prépare une liste triée par IP croissante, avec l’identité de chaque cible. Les caméras non authentifiées, les identités non vérifiables et les IP partagées sont exclues. Saisir **EFFACER**, puis valider la confirmation native pour envoyer un reset complet ONVIF `SetSystemFactoryDefault / Hard` aux cibles prêtes.

Le reset peut effacer les IP et identifiants ; plusieurs caméras peuvent revenir à la même IP d’usine. Il est irréversible dans Quasar : le journal n’est pas une sauvegarde intégrale permettant d’annuler le reset. Le profil Sezaam du Mac est conservé. La préparation est à usage unique, expire après deux minutes et devient invalide si le réseau ou la session change. L’identité et les conflits sont à nouveau contrôlés avant chaque envoi. Toute erreur ou réponse incertaine arrête les cibles suivantes ; aucune commande de reset n’est renvoyée automatiquement.

Le bilan distingue **Commande acceptée** et **À contrôler**, sans présenter un accusé de réception comme une vérification de l’état d’usine. Les sessions sont fermées après les tentatives et une redétection explicite est proposée. Une IP partagée après reset nécessite un branchement caméra par caméra pour réadresser le parc. Les étapes sont enregistrées avant l’envoi puis après chaque réponse dans `.runtime/profile-journal/factory-resets/`, sans mots de passe ; ce dossier est distinct de l’historique des profils.

Validation : tests de lot (annulation, phrase obligatoire, identité, contexte, expiration, journal indisponible, interruption et absence de répétition), transport SOAP sur simulateur local et parcours de confirmation de l’interface. Aucun reset de caméra physique n’a été exécuté pendant cette validation. Référence : [ONVIF Core §8.3.8](https://www.onvif.org/specs/2112/ONVIF-Core-Spec-v2112.pdf).
