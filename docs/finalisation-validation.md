# Validation de la reprise — 3 novembre 2026

316 tests Windows et 1 POSIX non applicable ; 317 sur POSIX. 44 stories × 4 variantes, 12 références Windows, 22 RTSP/superviseur.

La suite Storybook conserve sa propre instance Axe pour éviter une concurrence avec l’instance chargée par l’addon. Les deux scans restent actifs ; aucune règle ni variante n’est supprimée. Ce correctif du harnais de test et les mises à jour documentaires ne changent pas les runtimes des paquets retenus au commit dd8215f.

Les preuves CI et artefacts retenus sont dans [retained-artifacts.json](retained-artifacts.json). Elles identifient le commit réellement construit, distinct du dernier commit documentaire. Les anciennes exécutions ne servent pas à valider un nouveau changement de runtime.

Le laboratoire Platform utilise les vrais runtimes, Authentik et SMTP synthétiques, TLS vérifié et aucun port hôte. Il qualifie SSO/retour, invitations, récupération, expiration/usage unique, MFA et secours, révocation CLI, sessions et limites du logout global. Mira/Singularity/Orbit restent explicitement owner_only.

Six interfaces : web-vitals 6.2.3 standard, vues dédupliquées, transport borné sans contenu personnel ; chaîne réelle collecteur/admin, douze rapports CI/audit sourcés, catalogue visible/masqué/vide/panne/cache persistant. Cinq échantillons par mode/app pour le coût et collecteur réellement arrêté pour le test de panne.

Cinq hôtes asset : vingt contrôles des pages/fichiers/ZIP/Storybook/iframes et accès direct. Compose : réseau DB et Chromium privés, volumes/permissions/health et redémarrage. Douze volumes (applications, identité et Caddy) et PostgreSQL restaurés vers des destinations neuves, vrai login sur les copies ; rollback image et données distincts. Profil Chromium peuplé synthétiquement conservé.

Preuves transverses : doublemart-platform/docs/validation-evidence.json et tests/authentik-integration. Les mesures Docker Desktop ne garantissent pas la capacité du futur VPS. Les tests ciblés et audits ne sont pas une certification générale ; les avis modérés de développement restent visibles. Aucun téléphone, matériel caméra, installation utilisateur, donnée personnelle ou déploiement n’est déclaré testé.

Le portail retenu et son chargement sans reconstruction sont détaillés dans [portal-artifact.json](portal-artifact.json). Docker classique et containerd exposent des identifiants différents : la chaîne OCI archive → manifeste → configuration est vérifiée par hash, ainsi que le label du commit.

## Périmètres de preuve — reprise du 4 novembre 2026

- **Sauvegarde Compose** : 12 volumes persistants (applications, identité et Caddy) **+ PostgreSQL**, sauvegardé logiquement et restauré dans une base neuve. Preuve : `doublemart-platform/docs/validation-evidence.json`, section `recovery` (8 contrôles). Les neuf volumes applicatifs ne sont pas le total de la plateforme. Les douze relevés de ressources sont un autre décompte.
- **Déconnexion** : l’action SSO ferme la session de l’application appelante et celle du fournisseur d’identité. Les sessions déjà ouvertes dans les autres applications peuvent rester actives jusqu’à leur expiration ou leur propre déconnexion/révocation. Aucun back-channel logout ni déconnexion instantanée de toutes les applications n’est promis.
- **Propriétaire** : Mira, Singularity et Orbit réservent les historiques au couple issuer/sub configuré (`owner_only`). Une invitation ne donne pas accès à ces historiques. Portfolio et portail Quasar sont publics ; leurs espaces asset sont protégés séparément. Quasar natif reste hors ligne sans compte obligatoire ; l’administration Platform requiert son habilitation et le MFA.
- **Signatures Quasar** : Windows, Linux et DMG non signés ; application macOS signée **ad hoc**, vérification `codesign` effectuée, sans signature de distribution ni notarisation. Voir `quasar/docs/retained-artifacts.json`. Aucune recette caméra ou installation utilisateur n’est déduite de la fabrication des paquets.
- **Local et CI** : chaque résultat conserve sa commande et son commit source. Les 24 scans Axe d’Authentik qualifient l’identité uniquement, pas Orbit. Singularity : **8 tests Storybook dans la CI** (`src/RequestState.stories.tsx`) ; **79 tests dans 8 fichiers lors de l’exécution locale complète**, preuve `Singularity/docs/storybook-full-2026-11-04.json`. Les 79 tests serveur sont encore un compte distinct.
- **Artefacts retenus** : les SHA de `retained-artifacts.json` restent ceux des images/paquets réellement conservés. Ils ne changent pas avec cette reprise. Les anciennes images Mira/Orbit ne qualifient pas les nouvelles corrections d’interface ; les validations de cette PR et leurs artefacts portent leurs propres SHA. Aucune image n’est déclarée déployée.
