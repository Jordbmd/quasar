# Quasar — maintenance

Lire `docs/standards/core.md` à chaque tâche, puis les thèmes pertinents qu’il référence (architecture, sécurité, UI/UX, tests, observabilité, livraison) et `docs/standards/electron.md`. Export généré depuis Platform : aucune correction manuelle. Depuis la racine, `node docs/standards/verify.mjs` vérifie la cohérence hors ligne, pas la dernière version distante.

Application Electron locale de configuration de caméras Ethernet, sans compte cloud obligatoire. Node 24, TypeScript strict. Lire `README.md`, `docs/ARCHITECTURE.md` et `docs/COMPATIBILITE-FIRMWARE.md` avant transports ; `docs/PRODUCTION.md` avant préparation de livraison. Aucune modification des données utilisateur pour réussir un test.

## Frontières et invariants matériels

- `src/main/main.ts` compose fenêtres/chemins/autorisations ; `ipc-controller.ts` valide exclusivité/snapshots/annulation ; `service.ts` orchestre sessions et opérations spécialisées (defaults, addressing, factory-reset, sync-clock, osd, encoding).
- `platform.ts`/`platforms/` lisent le réseau système, distinct du réseau caméra ; `onvif.ts`/`vendor-transport.ts` portent les transports et compatibilités. Conserver les extensions XML et documenter les adaptations ONVIF 0.8.3.
- Toute nouvelle méthode figure dans `src/shared/types.ts`, `ipc-schemas.ts` et `ipc.ts`, avec traitement typé : préférences locales dans IpcController, opérations caméra dans dispatch. Renderer/shared n’importent jamais main/Electron/Node ; contrôle dependency-cruiser.
- `src/renderer/entry.tsx`/`main.tsx` composent React ; pages dans `pages/`, lectures dans `camera-reader.ts`, brouillons dans `Settings.tsx`.
- Ethernet uniquement : aucun Wi-Fi de secours, assistant réseau obligatoire, modification automatique du poste ou exécution administrateur. Une route invérifiable reste invalide ; un changement réseau invalide opérations et connexions.
- Identité/adresse vérifiées avant écriture. Conflit IP : protocole constructeur par numéro de série seulement après double découverte concordante (`docs/ADRESSAGE-CONFLITS.md`), sinon isolation physique. Jamais HTTP supposé ciblé par MAC ni modification ARP du poste.
- Lecture annulée, refus d’authentification, commande envoyée, résultat incertain et relecture conforme restent distincts. Aucune répétition automatique d’écriture.
- Profil fourni `config/sezaam-profile.json`, profil utilisateur prioritaire, aucun profil appliqué au démarrage. Reset usine séparé : phrase EFFACER, confirmation native et plans consommés une fois.
- Identifiants manuels en mémoire uniquement, jamais arguments/logs/temporaire en clair. Connexion automatique opt-in : safeStorage système dans `camera-login.enc`, jamais localStorage ni retour renderer, aucun repli basic_text ; désactiver supprime le fichier. Relais/tests en loopback.
- Conserver Quasar, bundle `fr.sezaam.camera-tool`, canaux `sezaam:*` et clés de préférences héritées. `src/shared/translations.json` pour textes applicatifs FR/EN, interpolations conservées ; ne pas traduire identité/valeur OSD. Langue native `language.json`, thème `sezaam-theme` (`light|dark|system`), changement et redémarrage vérifiés en smoke Electron.

## Validation et préparation

- `npm run validate:software` : types/lint/format/frontières/dépendances/tests/build/contrastes/parcours simulés. `npm run test:ui` : Electron isolé, réseau système désactivé. `npm run build-storybook && npm run test:stories` : catalogue/Axe. `npm run test:visual` : références visuelles inspectées avant actualisation.
- `npm run setup:video`, Go 1.27.3, reconstruit l’upstream vérifié et les dépendances corrigées verrouillées dans `config/go2rtc`. Go reste un outil de build ; aucun retour silencieux au binaire upstream vulnérable. `audit:distributed` contrôle Electron/modules embarqués, échoue sur avis connu, ne remplace pas RTSP. Ne jamais ignorer l’intégration RTSP faute de binaire.
- Injecter discovery/système ; serveurs sur 127.0.0.1 uniquement. Aucun build concurrent sur les sorties d’un test UI, aucune attente augmentée pour masquer une course. Simulation Windows ≠ exécution Windows ; aucune caméra réelle validée par ces tests.
- `npm run package:dir` prépare un paquet local autonome sans publication. Aucun remplacement du lanceur installé sans validation explicite ; limites/migration dans `docs/PLATEFORMES.md`. Aucun commit/push ou release sans demande explicite.
- `build:web` produit `site-dist/` et `assets-dist/`, Storybook sous `/storybook/`, tokens/assets existants. `test:web` couvre langues/thèmes/mobile/Axe et absence d’appels externes. Protéger l’origine asset avant exposition ; CI publique épinglée, trois OS natifs, `--publish never`, manifeste SHA-256.
- `build:portal`/`Dockerfile.portal` produisent le serveur public isolé, sans Electron, données locales ou espace technique. Collecte uniquement par jeton serveur selon le socle ; aucune donnée caméra (identifiants, IP/MAC, noms, réglages, journaux, images) transmise. Préserver nouveaux états Box, clavier et réponses obsolètes.
- Aucun achat/publication dans ce lot. Distinguer paquet, signature/notarisation, installation native et recette caméra ; les rapports CI techniques suivent le workflow de confiance défini dans le socle.
