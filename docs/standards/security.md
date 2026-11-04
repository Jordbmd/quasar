<!-- Generated rules; version=3.0.1; source=Jordbmd/doublemart-platform@3bda38909cf8f9c7b3a406ce791fa4543d988e2d:docs/standards/security.md -->
# Sécurité et identité

- Autoriser chaque accès côté serveur, y compris données, fichiers, exports, tâches, caches et sauvegardes. Visibilité dans un catalogue, disponibilité et droit d’accès sont des notions distinctes.
- OIDC via bibliothèque maintenue : Authorization Code + PKCE S256, state, nonce, signature, issuer, audience et expiration vérifiés. Clients confidentiels et callbacks exacts ; jetons côté serveur. Un fournisseur indisponible ferme l’accès.
- Sessions opaques expirantes, cookies host-only Secure/HttpOnly/SameSite en production. Retour de connexion sauvegardé côté serveur et limité aux chemins locaux non ambigus. CSRF et origine sur les mutations. Aucun mode local/mock/bypass activable en production.
- Lorsque le produit est réservé au propriétaire, utiliser le couple issuer/sub explicitement configuré. Jamais premier inscrit ni e-mail comme clé. Une invitation ne confère pas un historique ni un espace personnel isolé. Ne pas annoncer du multiutilisateur sans isolation validée.
- Administration distincte : habilitation par CLI hors web, registre en lecture seule relu à chaque accès, aucun endpoint de promotion. MFA et réauthentification récente attestées par claims vérifiés ; ne pas déduire MFA d’un champ client.
- Documenter logout local et SSO : fermer l’application appelante et le fournisseur d’identité ne garantit pas la fermeture des sessions déjà ouvertes ailleurs. Ne promettre un back-channel logout que s’il est implémenté et testé.
- SQL paramétré, sorties échappées, redirections bornées, uploads/extractions limités en taille, nombre et chemin. Refuser traversées, liens et destinations ambiguës. Erreurs publiques sans corps distant ni secret.
- Secrets hors Git, bundles, images, logs, captures et rapports. Dépendances embarquées et outils de développement distingués dans les audits. Aucun accès privilégié ajouté pour faciliter un test.
- Pages non indexables : meta robots et X-Robots-Tag sur HTML, statique, fichiers et erreurs, sans sitemap d’indexation. La non-indexation ne remplace jamais l’authentification à l’origine, y compris Storybook, archives et iframes.
- Bases, Selenium, profils et interfaces d’administration restent sur des réseaux privés. Ne pas exposer socket Docker ou shell à une interface web. Proxy de confiance exact, pas tout un réseau par commodité.
