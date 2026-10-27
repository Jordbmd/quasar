# Outillage retenu

Tout fonctionne localement. Aucun dépôt, capture ou rapport caméra n’est transmis à un indexeur. Les outils ajoutés sont des dépendances de développement, absentes du paquet autonome.

| Outil | Problème, alternative et entretien | Licence / fonctionnement |
| --- | --- | --- |
| dependency-cruiser 18.7 | Frontières renderer/main/shared, cycles et imports non résolus. Un script artisanal serait moins fiable. Un seul analyseur de graphes ; règles dans .dependency-cruiser.cjs | MIT ; analyse statique locale |
| Knip 6.43 | Dépendances/exportations inutilisés avec entrées Electron/preload/renderer/stories/scripts/tests déclarées. Complète le graphe sans le dupliquer. Examiner chaque résultat avant suppression | ISC ; analyse locale, knip.json |
| ESLint 10.13 + typescript-eslint 8.72 + hooks 7.1 | Promesses oubliées, await incorrect, règles des hooks et erreurs de contrôle. Prettier seul ne les détecte pas. Règles ciblées, pas d’activation aveugle de milliers de règles sur les réponses firmware | MIT ; typage TypeScript local |
| electron-builder 26.18 | Paquets autonomes cohérents sur trois OS. Forge aurait aussi convenu mais ajouterait un second cycle de makers ; un seul packager retenu. Scripts de lanceur macOS conservés séparément | MIT ; copie/ASAR/signature locale, publication désactivée |
| fflate 0.8 | Extraction portable d’un seul binaire ZIP connu en mémoire, sans dépendre d’un unzip système. Aucun chemin d’archive matérialisé. Empreinte upstream vérifiée avant extraction | MIT ; uniquement outil d’installation |

Node.js **24** est la référence de développement ; le lockfile fixe les versions. Vitest, Playwright, Storybook, Axe, Zod et Prettier s’exécutent localement. Aucun workflow CI/CD n’est conservé dans le dépôt.

Repomix (MIT) a été évalué mais n’est pas installé : la carte d’architecture et les recherches ciblées suffisent aujourd’hui. Si un export devient nécessaire, utiliser une liste explicite de sources, datée, sous `analysis-output/` ignoré ; exclure .runtime, données utilisateur, captures, logs, binaires, assets générés et secrets. Ne pas connecter de service externe. « Graphify » ne désigne pas un besoin ou un paquet suffisamment précis ; aucun paquet choisi sur cette seule ressemblance de nom.

Electron passe de 44.9.0 à 44.9.3 pour le correctif de sécurité GHSA-jr5w-w6x2-84p9, séparément des protocoles. Pas de changement majeur, ni d’update d’ONVIF/go2rtc. Le lanceur installé n’est pas remplacé par ce travail : sa version Electron ne change qu’à sa reconstruction ultérieure.

## Sources officielles vérifiées le 26 octobre 2026

- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
- [Configuration Knip](https://knip.dev/overview/configuration)
- [Typage ESLint](https://typescript-eslint.io/getting-started/typed-linting/)
- [electron-builder v26](https://www.electron.build/v26/docs/configuration/)
- [fflate](https://github.com/101arrowz/fflate)
- [Sécurité Repomix](https://repomix.com/guide/security)
- [Correctif Electron](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9)

L’audit npm de l’installation finale n’annonce plus de vulnérabilité. Cela ne remplace pas une revue de sécurité, ni la validation du matériel.
