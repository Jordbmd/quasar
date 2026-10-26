# Inventaire de migration Quasar

Le projet local est conservé : Electron 44, React 19, Vite 7, TypeScript et Lucide. Aucun nouveau dépôt, aucun service distant. Aucun fichier AGENTS.md ou règle .cursor trouvé dans le projet et ses parents inspectés.

| Zone | Avant | Migration réalisée |
| --- | --- | --- |
| Identité | Sezaam, pictogramme caméra générique, Inter seule | Quasar, symbole vectoriel reconstruit, logotype en tracés, Sora / Inter / JetBrains Mono |
| Styles | Variables clair/sombre et composants dans style.css | Tokens séparés, primitives React partagées, styles de composants et mise en page |
| Caméras | Ethernet automatique, liste, aperçu, identité et trois formulaires | Même disposition, palette et composants Quasar |
| Diagnostic | Synthèse, sélection caméra, résultats, journal | Composants métier documentés et états sémantiques partagés |
| Formulaires | Field et Capability partagés, contrôles HTML natifs | Labels, aides/erreurs associés, styles cohérents, contrôles natifs conservés |
| Feedback | Bannières, chargement, dialogues navigateur/macOS | Alert, indicateurs, modal accessible et confirmation locale ; confirmations sensibles macOS conservées |
| Packaging | Bundle macOS local signé ad hoc, UUID stable | Nom Quasar, ICNS intégré, identifiants techniques et stockage préservés |
| Tests | Vitest, Playwright Electron et simulateur, Axe, contrastes | Tests existants enrichis, Storybook isolé, assets et références visuelles |

Pas d’écran Paramètres général, de projets ni de tableau de bord fictif à ajouter. Les paramètres sont ceux des caméras. Les références cosmiques ne sont pas des fonds de travail. Le backend ONVIF et la politique Ethernet automatique restent en place.
