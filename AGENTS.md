# Quasar — consignes de maintenance

Application Electron locale de configuration de caméras Ethernet. Lire README.md puis docs/ARCHITECTURE.md et docs/COMPATIBILITE-FIRMWARE.md avant de toucher aux transports. Node.js 24, TypeScript strict. Ne pas modifier les données utilisateur pour faire passer un test.

## Points d’entrée et frontières

- `src/main/main.ts` : composition Electron, fenêtres, chemins et autorisations IPC.
- `src/main/ipc-controller.ts` : validation, exclusivité, snapshots et annulation.
- `src/main/service.ts` : orchestration des sessions/opérations. Les opérations spécialisées sont dans defaults, addressing, factory-reset, sync-clock, osd et encoding.
- `src/main/platform.ts` et `platforms/` : réseau système en lecture seule. Ne pas confondre réseau du poste et configuration réseau d’une caméra.
- `src/main/onvif.ts`, `vendor-transport.ts` : transports et compatibilités de firmware.
- `src/shared/types.ts`, `ipc-schemas.ts`, `ipc.ts` : contrat, validation et politiques IPC. Ajouter une méthode exige une entrée dans les trois contrats et un cas dispatch typé.
- `src/renderer/entry.tsx`, `main.tsx` : composition React. Pages dans `pages/`, réception des lectures dans `camera-reader.ts`, brouillons dans `Settings.tsx`.
- Aucun import main/Electron/Node depuis renderer ou shared. Vérifié par dependency-cruiser.

## Invariants

- Ethernet seulement, pas de Wi-Fi de secours, d’assistant réseau obligatoire, de modification automatique du poste ou d’exécution administrateur.
- Une route non vérifiable ne devient jamais une route valide. Un changement réseau invalide les opérations et connexions.
- Identité et adresse vérifiées avant toute écriture. Conflits IP : protocole constructeur à numéro de série uniquement après double découverte concordante (voir docs/ADRESSAGE-CONFLITS.md), sinon isolation physique. Jamais d’écriture HTTP supposée ciblée par MAC ou de modification ARP du poste.
- Lecture annulée, refus d’authentification, commande envoyée, résultat incertain et relecture conforme sont distincts.
- Aucune répétition automatique des écritures. Conserver les extensions XML et documenter les adaptations ONVIF 0.8.3.
- Profil Sezaam fourni dans `config/sezaam-profile.json`. Le profil utilisateur est prioritaire, aucun profil n’est appliqué au démarrage.
- Reset usine séparé du profil, phrase EFFACER et confirmation native, plans consommés une fois.
- Identifiants en mémoire seulement, jamais arguments/logs/fichiers temporaires. Relais et tests en loopback.
- Conserver noms Quasar, bundle `fr.sezaam.camera-tool`, canaux `sezaam:*` et clés de préférences héritées.

## Validation sans matériel

`npm run validate:software` : types, lint, format, frontières, dépendances, tests, build, contrastes et parcours simulés. `npm run test:ui` : Electron isolé, réseau système désactivé. `npm run build-storybook && npm run test:stories` : catalogue/Axe. `npm run test:visual` : références visuelles (inspecter avant toute actualisation).

Exécuter `npm run setup:video` pour le binaire officiel vérifié. Les intégrations RTSP ne doivent jamais être ignorées parce que le binaire manque. Injecter discovery/système, utiliser uniquement 127.0.0.1 pour les serveurs. Ne pas lancer deux builds sur les mêmes sorties pendant un test UI. Ne pas augmenter les délais pour cacher une course. Une simulation Windows n’est pas une exécution Windows ; aucune caméra réelle n’est validée par ces tests.

`npm run package:dir` prépare un paquet autonome local, sans publication. Ne pas remplacer le lanceur installé avant validation explicite. Voir docs/PLATEFORMES.md pour les limites et la migration. Ne pas publier de release ni committer/pousser sans demande explicite.
