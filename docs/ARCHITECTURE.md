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

| Fonction | Fichiers principaux | Tests |
| --- | --- | --- |
| Contrat et exclusivité IPC | shared/types, ipc-schemas, ipc ; main/ipc-controller | ipc-controller, core |
| Ethernet poste | platform, platforms/*, network | platforms, core |
| Découverte / identité / conflits | discovery, addressing, service | discovery-socket, addressing-conflicts, addressing |
| Sessions / lectures / reprises | service, onvif, cancellation | session, onvif-retry, camera-reader |
| Compatibilité et writes XML | onvif, encoding, osd | integration, encoding, osd |
| API constructeur | vendor-profile, vendor-transport, daylight, web-osd | vendor-profile, vendor-transport, portable-transport, daylight-osd |
| Profil / journal / horloge | defaults, profile-journal, sync-clock, camera-clock | defaults, profile-journal, shipped-profile |
| Reset usine | factory-reset ; renderer/FactoryReset | factory-reset + fixture UI |
| Vidéo / processus | video, video-supervisor | integration, playback, video-assets, video-supervisor |
| Données et migration | storage | storage, smoke Electron isolé |
| Interface / brouillons | renderer/main, Settings, camera-form-values, camera-reader, pages | camera-reader, ui-fixtures, stories, visual |

## Décisions de consolidation

Le contrôleur IPC et les schémas ne sont plus noyés dans Electron/service. Le dispatch utilise une union discriminée, et les politiques de verrouillage couvrent toutes les actions à la compilation. Les événements ont une table commune et le preload ne transmet aucun objet Electron au renderer.

L’opération d’horloge est isolée de l’aiguillage des commandes, avec les adaptations firmware inchangées. Le service conserve la session et les invariants d’identité : il reste volumineux, mais le remplacer par un registre dynamique rendrait les écritures plus difficiles à suivre.

Les pages Diagnostic et Paramètres, les transformations du formulaire et la réception des lectures ont des modules distincts. Le formulaire garde ses brouillons ; une arrivée de capacités ne les écrase pas. Navigation/changement de caméra demande confirmation si nécessaire. Une rupture réseau rend la cible invalide et abandonne explicitement les modifications non envoyées ; elles ne sont jamais appliquées à une nouvelle identité.

Le graphe est contrôlé localement par dependency-cruiser. Pas de bus d’événements global, de conteneur d’injection, de nouveau store React ni de bibliothèque de formulaires.
