# Mode Box

Quasar démarre en **Classique**. Le sélecteur de la page Caméras permet de passer en **Box**, puis de retrouver le mode Classique. Les Box et leurs associations sont conservées localement dans la bibliothèque `quasar-box-library` ; le mode de démarrage reste Classique. L’ancien enregistrement `quasar-installed-box` est repris dans la bibliothèque lors de sa première ouverture et reste intact comme sauvegarde.

## Import compatible avec le backoffice

Importer le fichier XLSX, XLS ou ODS contenant une feuille nommée exactement `Back office`. Un CSV utilise directement sa première feuille. Les six premières colonnes, dans cet ordre, sont :

| Casier | N° | Colonne | Zone | Ports | IP |
| --- | --- | --- | --- | --- | --- |
| IHM | 0 | 1 | 1 | 0 | 0.0.0.0 |
| S | 1 | 1 | 2 | 1 | 192.168.1.11 |
| M | 7 | 2 | 1 | 7 | 192.168.1.17 |

Types reconnus : S, M, L, XL, XXL, O, P et IHM. Une seule IHM, numéro 0 et IP 0.0.0.0, est obligatoire. Elle est dessinée mais jamais associée à une caméra ni incluse dans les opérations caméra. Les numéros caméra vont de 1 à 244 et peuvent être non consécutifs. Doublons, lignes incomplètes, formats inconnus et formules sont refusés avec un message ; l’ancien import reste en place. Les formules doivent être remplacées par leurs valeurs.

La lecture utilise SheetJS CE 0.20.3 depuis son [paquet officiel](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), verrouillé avec intégrité dans package-lock.json. Elle s’exécute dans un worker interrompu après 15 secondes, avec une limite de fichier de 5 Mo et de 1 000 lignes. Aucune requête vers le backoffice ou l’API n’est nécessaire pour importer.

## Vue et associations

Le plan reprend `logistics/src/components/organisms/BoxLayout` et la disposition de `BoxOverview/BoxLayoutCard` : deux pistes par colonne, tailles relatives S/M/L/XL/XXL/O/P, tri par colonne, zone puis numéro, paires de P et dessin IHM. Un P isolé réserve sa hauteur pour éviter le recouvrement du casier suivant. Les couleurs sont adaptées aux thèmes Quasar et à la configuration des caméras.

Le panneau au clic affiche format, position, ports, IP du fichier et IP cible. La caméra est proposée uniquement si l’IP importée correspond à un seul appareil détecté. L’utilisateur peut choisir une autre caméra et vérifier son retour vidéo. Les associations enregistrées suivent l’endpoint ONVIF, sinon la MAC, sinon l’identité limitée à la session ; elles ne sont pas reportées silencieusement sur une caméra remplaçante à la même IP.

- Vert : caméra connectée et IP égale à numéro + 10, sans erreur d’opération connue dans la session.
- Rouge : caméra explicitement associée absente, conflit, refus/erreur de connexion, association en double ou résultat du profil/adressage à vérifier.
- À vérifier : aucune association, caméra à connecter, réseau indisponible ou IP à attribuer.

Le vert n’atteste pas à lui seul que les 52 réglages du profil ont été vérifiés. Le bilan détaillé du profil reste la référence. Les résultats d’opération sont propres à la session ; la Box et ses associations persistent, pas une ancienne preuve de conformité.

## Opérations

**Attribuer les IP · toute la Box** exige une caméra distincte par casier hors IHM. Le plan est trié par numéro et utilise `192.168.1.(numéro + 10) / 255.255.255.0`, par exemple casier 7 → .17, indépendamment de la position de la caméra dans la découverte. Les associations sont enregistrées avant préparation pour survivre au changement d’IP. Une préparation n’envoie aucune écriture ; le plan et la confirmation native précèdent l’application.

L’entrée `previewAddresses` accepte des associations explicites optionnelles, validées à la frontière IPC et dans la construction du plan. Les contrôles d’identité, de route, de conflit et de relecture restent communs aux deux modes. Les caméras hors Box participent au contrôle des destinations occupées et ne sont pas modifiées. Une IP occupée par une caméra hors du lot reste bloquée. Pour les caméras incluses, le plan ordonne les déplacements et peut utiliser une IP temporaire pour une permutation, uniquement avec un ciblage constructeur confirmé. Chaque destination doit être libre avant son utilisation. Le bouton **Résoudre les conflits** ouvre une analyse distincte, sans casier : il conserve une caméra à chaque IP partagée et propose des IP libres aux autres. Voir [Réadressage des IP partagées](ADRESSAGE-CONFLITS.md) pour les contrôles et les limites.

**Profil Sezaam · toute la Box** cible uniquement les caméras associées, avec le parcours de prévisualisation et d’application existant. Le panneau casier permet aussi d’appliquer le profil à sa seule caméra ou d’ouvrir ses paramètres et son flux principal.

## Validation

`tests/box.test.ts` couvre les quatre formats, les erreurs d’import, les proportions, les associations uniques et stables, l’exclusion de l’IHM, les numéros non consécutifs et les destinations occupées hors Box. `npm run test:box` vérifie le parcours dans le build : import réel dans le worker, états, associations, plan explicite, bilan, persistance, démarrage Classique, accessibilité clair/sombre et largeur réduite. Les appareils sont simulés et aucun matériel n’est contacté.

## Fichiers de production et fiche sans Excel

Les fichiers de production complets peuvent contenir `Infos Box`, `Config`, `Plan de cablage` et `Back office`. Seules ces feuilles sont lues ; les nomenclatures de pièces ne sont pas importées. Les fichiers d’origine ne sont jamais modifiés.

- `Infos Box` fournit l’ID, le nom lorsqu’il existe, l’adresse finale, les nombres déclarés de colonnes/modules/casiers, le format, l’encastrement, la fermeture arrière, l’air salin, le sticker, la visite du site, le départ souhaité, les coloris Trespa et les points d’attention. Les autres paires libellé/valeur sont conservées dans le détail. En l’absence de nom explicite, le titre est `Box <ID>` ; l’adresse n’est pas utilisée pour inventer un nom.
- `Config` complète les informations manquantes et fournit les numéros des contrôleurs Southco déclarés, ainsi que la référence du fichier de configuration. `Infos Box` reste prioritaire en cas de divergence d’option, avec un avertissement. Deux ID de Box différents bloquent l’import pour éviter une mise à jour de la mauvaise Box.
- `Back office` reste la référence de la disposition, des numéros, IP et ports des serrures. Les ports `1:4,2:4` sont présentés comme « Module 1 · port 4 » et « Module 2 · port 4 », y compris pour l’IHM. Le plan de câblage est comparé lorsque ses étiquettes sont reconnues ; une divergence est signalée, jamais fusionnée silencieusement.
- Les modules Southco utilisés mais non déclarés, les ports partagés et les nombres de casiers incohérents sont signalés sur la fiche. Ces contrôles décrivent le fichier, pas une mesure des serrures. Quasar n’envoie aucune commande Southco. Les valeurs enregistrées des cellules de métadonnées sont lues sans recalculer ni exécuter de formule ; les formules des six colonnes de casiers restent refusées.

Réimporter la **même ID de Box**, même depuis un fichier renommé, remplace les informations présentes et le plan par la nouvelle version. Sans ID des deux côtés, le nom du fichier sert de repli (migration de l’ancien import incluse). Deux ID différents ne sont jamais fusionnés, même si le nom du fichier est identique. Les associations explicites sont conservées pour les numéros de casiers toujours présents, retirées pour les casiers supprimés ; les nouveaux casiers restent à vérifier. Un nom personnalisé est conservé si le fichier ne fournit aucun nom. Les métadonnées absentes d’un simple export de casiers restent conservées. Un fichier d’une autre Box ajoute une fiche distincte à la bibliothèque ; aucune fiche existante n’est remplacée.

**Créer sans fichier** ouvre une fiche pour les anciennes Box : informations générales, options, casiers, positions, ports et IP connues. Une IHM fixe numéro 0 est incluse ; les autres casiers peuvent être ajoutés, supprimés ou modifiés. Un port ou une IP inconnus peuvent rester vides, sans association automatique à une caméra. **Modifier la Box** permet de corriger ensuite cette même fiche, importée ou manuelle. Annuler ou un échec de validation conserve la fiche précédente. Enregistrer ou réimporter ne configure aucune caméra ; l’attribution des IP et l’application du profil restent des actions séparées.


## Bibliothèque et navigation

**Mes Box** liste les fiches enregistrées avec recherche par nom, ID ou adresse. L’import et la création manuelle sont possibles sans Ethernet ni session caméra, pour préparer les interventions. Chaque fiche conserve son plan et ses associations ; aucune ancienne connexion n’est présentée comme une preuve de conformité. Le bouton **Ouvrir la Box** affiche son plan dans le mode Box. Le sélecteur **Changer de Box** permet ensuite de passer directement d’un site à l’autre.

Le réimport recherche l’ID dans toute la bibliothèque, même si une autre Box est active. Il met à jour cette fiche et conserve les associations des casiers présents. Une nouvelle ID ajoute une fiche. Sans ID, le nom du fichier sert de repli ; un résultat ambigu est refusé. L’édition d’une fiche ne peut pas prendre l’ID d’une autre. Les données sont validées avant enregistrement ; si le stockage est plein ou illisible, elles ne sont pas remplacées silencieusement.

Changer de Box demande d’abandonner les brouillons caméra éventuels, arrête le lecteur, annule la lecture et efface la sélection caméra. Les retours tardifs d’un changement précédent ne peuvent pas réactiver l’ancienne Box. Les erreurs d’application du profil et d’adressage restent séparées par fiche pendant la session. L’import, la sélection et la création d’une fiche ne réalisent aucune écriture sur le matériel.

La barre latérale regroupe quatre entrées : **Caméras**, **Mes Box**, **Diagnostic** et **Paramètres**. Diagnostic contient les tests/journaux et l’état Ethernet ; Paramètres contient les préférences d’application et le profil Sezaam. Le passage entre ces rubriques conserve les confirmations des modifications non enregistrées. Le réseau et la connexion commune restent accessibles au bas de la barre latérale ; son repli et le thème restent disponibles.

Le formulaire manuel exige uniquement l’ID de la Box ; le nom est facultatif (repli `Box <ID>`). Les options visibles sont Encastrée, Fermeture arrière et Air salin. Les métadonnées de fabrication importées restent conservées. Une nouvelle IHM utilise les ports `1:14,2:14` par défaut, modifiables ; les ports déjà enregistrés ne sont pas remplacés. Les casiers sont présentés dans l’ordre ID, type, zone, colonne, IP caméra, ports Southco.

Le sélecteur de Box ouvre une liste sous le champ, avec clavier (flèches, Entrée, Échap) et couleurs du thème. L’ID numérique de la fiche ouvre son détail dans le navigateur système, exclusivement sur `https://bo.sezaam.fr/box/<ID>/detail`.

## Association et ouverture automatiques

Sans association manuelle, une caméra unique et sans conflit à l’IP `192.168.1.(casier + 10)` est associée automatiquement dans la vue et les actions de la Box, même si la fiche manuelle ne contient pas d’IP. L’IP de la fiche sert de repli uniquement lorsqu’aucune caméra n’est détectée à l’adresse attendue. Un doublon ou une identité ambiguë à l’adresse attendue bloque cette déduction. Les associations manuelles (y compris « Aucune caméra associée ») restent prioritaires ; aucune nouvelle identité ne remplace silencieusement une association enregistrée.

Sélectionner un casier ouvre directement la caméra et charge ses paramètres, avec démarrage du flux principal si la lecture automatique est activée. L’action ne lance ni attribution d’IP ni application du profil. Sans caméra exploitable, la sélection précédente est libérée ; l’IHM reste sans caméra. Les changements de caméra conservent la confirmation des brouillons et l’annulation des lectures précédentes.
