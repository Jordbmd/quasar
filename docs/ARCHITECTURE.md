# Carte du projet

Quasar reste une application Electron locale. Le profil Sezaam est une configuration métier fournie, pas une condition d’accès aux opérations caméra. Aucune couche cloud ni base de données ajoutée.

```mermaid
flowchart LR
  UI[Pages et brouillons React] --> Bridge[Preload : call et abonnements]
  Bridge --> IPC[Contrôleur IPC : validation et exclusivité]
  IPC --> Service[Service : session et orchestration]
  Service --> Op[Profil / adressage / reset / horloge / OSD]
  Op --> Guard[Route, adresse source et identité]
  Guard --> Transport[ONVIF / web constructeur]
  Transport --> Verify[Relecture et comparaison]
  Verify --> Journal[Journal local privé]
  Verify --> UI
```

## Les chemins à suivre

- **Découverte** : Caméras → discover → NetworkGuard → SystemNetwork → socket WS-Discovery liée à IPv4 Ethernet → fusion des identités → liste. Les tests injectent la socket ; aucune diffusion réelle.
- **Session** : SessionBar → connectSession → connexions par caméra avec identifiants communs en mémoire → identité/profils → erreurs individuelles. Déconnexion et changement réseau détruisent connexions/caches.
- **Lecture** : sélection → CameraReader (id de demande + génération) → selectCamera/readCamera → CameraConnection.detail → événements progressifs → blocs du formulaire. Réponses tardives ignorées. Le cache est explicitement indiqué.
- **Écriture** : brouillon → commande IPC validée → contrôles de route/identité → sauvegarde si nécessaire → envoi unique → relectures bornées → résultat distinct envoyé/accepté/vérifié/incertain. Le contrôleur bloque les opérations concurrentes, mais laisse états/journaux consultables.
- **Vidéo** : sélection du profil → startVideo → URI en mémoire → proxy RTSP source-bound → go2rtc loopback → WebSocket local → MSE. Arrêt : consommateur, TEARDOWN, sockets puis superviseur. Les délais du lecteur ne mesurent pas la latence caméra de bout en bout.

## Responsabilités et tests

| Fonction                         | Fichiers principaux                                               | Tests                                                              |
| -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| Contrat et exclusivité IPC       | shared/types, ipc-schemas, ipc ; main/ipc-controller              | ipc-controller, core                                               |
| Ethernet poste                   | platform, platforms/*, network                                    | platforms, core                                                    |
| Découverte / identité / conflits | discovery, addressing, lan-addressing, service                    | discovery-socket, addressing-conflicts, addressing, lan-addressing |
| Sessions / lectures / reprises   | service, onvif, cancellation                                      | session, onvif-retry, cancellation, camera-reader                  |
| Compatibilité et writes XML      | onvif, encoding, osd                                              | integration, encoding, osd                                         |
| API constructeur                 | vendor-profile, vendor-transport, daylight, web-osd               | vendor-profile, vendor-transport, portable-transport, daylight-osd |
| Profil / journal / horloge       | defaults, profile-journal, sync-clock, camera-clock               | defaults, profile-journal, shipped-profile                         |
| Reset usine                      | factory-reset ; renderer/FactoryReset                             | factory-reset + fixture UI                                         |
| Vidéo / processus                | video, video-supervisor                                           | integration, playback, video-assets, video-supervisor              |
| Données et migration             | storage                                                           | storage, smoke Electron isolé                                      |
| Interface / brouillons           | renderer/main, Settings, camera-form-values, camera-reader, pages | camera-reader, ui-fixtures, stories, visual                        |

## Décisions de consolidation

Le contrôleur IPC et les schémas ne sont plus noyés dans Electron/service. Le dispatch utilise une union discriminée, et les politiques de verrouillage couvrent toutes les actions à la compilation. Les événements ont une table commune et le preload ne transmet aucun objet Electron au renderer.

L’opération d’horloge est isolée de l’aiguillage des commandes, avec les adaptations firmware inchangées. Le service conserve la session et les invariants d’identité : il reste volumineux, mais le remplacer par un registre dynamique rendrait les écritures plus difficiles à suivre.

Les pages Diagnostic et Paramètres, les transformations du formulaire et la réception des lectures ont des modules distincts. Le formulaire garde ses brouillons ; une arrivée de capacités ne les écrase pas. Navigation/changement de caméra demande confirmation si nécessaire. Une rupture réseau rend la cible invalide et abandonne explicitement les modifications non envoyées ; elles ne sont jamais appliquées à une nouvelle identité.

Le graphe est contrôlé localement par dependency-cruiser. Pas de bus d’événements global, de conteneur d’injection, de nouveau store React ni de bibliothèque de formulaires.

### Durée de vie des lectures

La revue du 4 novembre 2026 conserve ces frontières et corrige leur coordination.
`CameraService.selectDetail` possède l’annulation de toute la lecture, y compris
la vérification asynchrone de route précédant l’accès caméra. Une annulation rend
la main sans attendre cet adaptateur ; son résultat tardif ne démarre aucune
lecture et ne remplit aucun cache. Le contrôle de route n’est ni contourné ni
interrompu au niveau du système d’exploitation.

`abortable` retire son écouteur dès l’annulation ou le règlement de la promesse,
même si le signal était déjà annulé et que le transport ne se termine jamais.
Il observe encore un éventuel rejet tardif. Cette primitive ne réessaie aucune
opération et ne transforme pas une écriture incertaine en réussite.

Dans le renderer, l’identité de requête est unique entre instances de
`CameraReader`, tandis que la révision reste propre à chaque lecteur. Ainsi,
remonter un lecteur sur la même caméra ne réaccepte pas les événements de son
prédécesseur. Les brouillons, la sélection et la vidéo gardent leur coordination
existante. Les tests ciblés couvrent attente de route, promesse de transport
pendante, rejet tardif et remplacement/remontage du lecteur, sans caméra réelle.

## Bibliothèque de Box

`box-storage.ts` valide et conserve la bibliothèque locale, reprend l’ancienne fiche sans l’effacer, et centralise les ajouts, mises à jour par identité et associations propres à chaque fiche. `BoxLibrary` fournit la recherche et la préparation hors connexion ; `BoxView` affiche la fiche active. `BoxImport` lit les fichiers dans un worker et `BoxEditor` gère les brouillons locaux. Les changements de contexte invalident sélection/lectures/vidéo avant d’ouvrir une autre Box ; aucun import ou changement de fiche n’envoie de réglage au matériel. Les transports et contrôles IPC restent communs aux deux modes. Les tests `box-library`, `box`, `test:box` et le smoke Electron couvrent migration, isolation des associations, réimport, navigation et persistance.

## Connexion automatique

`main/auto-login.ts` gère le fichier chiffré atomique `camera-login.enc`, avec un chiffreur injecté. La composition Electron utilise les API asynchrones safeStorage et refuse le repli Linux basic_text. Les contrats `getAutoLogin`, `saveAutoLogin`, `connectSavedSession` sont validés et leur politique IPC est explicite. Le service réutilise `connectSession` et ses contrôles réseau ; le renderer tente une seule connexion après disponibilité Ethernet, ne réessaie pas un refus, respecte une déconnexion volontaire. La désactivation efface la mémorisation sans déconnecter une session déjà ouverte. Tests isolés : stockage et suppression, secret non exposé, coffre indisponible/fichier corrompu, réseau refusé, activation et redémarrage, refus sans boucle.

## Clôture de la revue : périmètre examiné et dette

La reprise suivant le bilan du 4 novembre examine les frontières ci-dessous ; elle ne certifie pas toute l’architecture à partir d’un seul refactoring.

| Périmètre examiné                                             | Problème confirmé / correction                                                                                                  | Conservé et justification                                                                                                                   | Dette ou limite                                                                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service caméra : session, sélection, réseau, writes, dispatch | Annulation auparavant trop tardive pendant la garde route, corrigée dans 2869e5f ; tests route pendante/rejet tardif.           | Service propriétaire des sessions et identités, opérations spécialisées séparées ; pas registre dynamique qui masque l’ordre des écritures. | Service encore volumineux, découpe supplémentaire à motiver par un scénario ; firmware et intermittence RTSP restent non certifiés.                         |
| IPC, preload et schémas                                       | Validation, politiques d’exclusivité/snapshot/annulation et erreurs examinées ; pas de défaut supplémentaire démontré.          | Contrat typé/union discriminée et validation main ; aucune préférence sensible rendue au renderer.                                          | Une nouvelle commande exige contrat/schéma/politique/test ; aucun bypass de sécurité ajouté.                                                                |
| Coordination React, Box, brouillons et lectures               | Identité de requête réutilisée entre lecteurs corrigée dans 2869e5f ; cycle de vie au démontage et réponse obsolète testés.     | CameraReader dédié, états locaux et confirmations ; Box ne déclenche pas d’écriture caméra.                                                 | main.tsx et Settings restent importants ; absence de réécriture/bus global sans bénéfice démontré.                                                          |
| Adaptateurs système, transports et vidéo                      | Contrats injectables, délais bornés, arguments validés, source Ethernet et nettoyage examinés ; aucune nouvelle course prouvée. | Adaptateurs OS séparés, macOS curl pour compatibilité, ONVIF/vendor distincts ; writes incertaines jamais réessayées automatiquement.       | Tests injectés/loopback ne valident pas chaque OS/firmware réel ; annuler l’attente ne prouve pas l’arrêt immédiat d’une commande OS déjà partie.           |
| Persistance, migration et livraison native                    | Manquait une preuve de restauration après copie à froid ; smoke source/paquet étendu, nouveau test de restauration du chiffré.  | Formats historiques, migration non destructive, coffre opt-in ; données natives indépendantes des volumes web.                              | Coffre réel désactivé dans le mode test ; chiffreur injecté distinct. Installation NSIS/DMG/AppImage et migration de clé entre comptes restent hors preuve. |

Graphe revérifié : 114 modules / 336 dépendances sans violation. Knip ne détecte pas de code/dépendance inutilisés ; quatre conseils de configuration restent visibles (entrées redondantes/extensions), pas un défaut runtime. Aucune nouvelle abstraction ni dépendance ajoutée à cette clôture.
