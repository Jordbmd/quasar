# Socle Doublemart 1.0.1

Contrat commun du 3 novembre 2026. Lire avant tout changement d'identité,
d'exposition, de collecte, de livraison ou de catalogue. La copie canonique est
dans doublemart-platform ; les autres dépôts embarquent cette version pour
rester autonomes (Quasar est public). Toute évolution nécessite une version et
une revue des cinq consommateurs. Aucun déploiement réel dans cette mission.

## Domaines et chemins

Portfolio https://doublemart.fr ; catalogue /fr/outils et /en/tools.
Applications https://mira.doublemart.fr, https://singularity.doublemart.fr,
https://orbit.doublemart.fr. Quasar local sans compte obligatoire ; présentation
https://quasar.doublemart.fr. Identité https://auth.doublemart.fr ; administration
https://admin.doublemart.fr. Design : https://asset.{mira,singularity,orbit,quasar,web}.doublemart.fr
(accolades à développer). Racine technique, Storybook statique sous /storybook/.
Les assets sont protégés à l'origine, jamais un serveur de développement.

Réseau Docker externe commun : `doublemart-edge`. Les services et leurs alias
sur ce réseau sont uniques : `web` (portfolio), `mira`, `singularity`, `orbit`,
`admin`, `authentik-server`, `caddy`. Ne pas appeler plusieurs services `web` :
Compose publie aussi le nom du service dans son DNS. Seul Caddy publie des ports.
Son adresse stable exacte est le seul proxy de confiance Authentik (/32 ou /128),
pas tout le sous-réseau. Les bases et Selenium restent sur des réseaux séparés.

## Identité et autorisation

Authentik OIDC, clients confidentiels distincts doublemart-mira,
doublemart-singularity, doublemart-orbit, doublemart-admin. Slugs correspondants
mira, singularity, orbit, admin. Issuer de chaque application :
https://auth.doublemart.fr/application/o/<slug>/ ; discovery à
<issuer>.well-known/openid-configuration. Callback exact
https://<slug>.doublemart.fr/auth/callback. Aucun wildcard.
Le portfolio public et Quasar local ne nécessitent pas de compte.

Bibliothèque OIDC maintenue, Code + PKCE S256, state/nonce/signature/issuer/audience/
expiration vérifiés. Jetons côté serveur uniquement. Sessions opaques, expirantes,
cookies host-only Secure HttpOnly SameSite=Lax (préfixe __Host- en production).
Retour sauvegardé côté serveur et limité aux chemins relatifs locaux : refuser
//, antislash, schémas, contrôles, encodages ambigus. CSRF + origine pour mutations.
Panne du fournisseur = accès fermé. Pas de mode local/mock en production.

Variables communes : NODE_ENV=production (ou APP_ENV=production pour Python),
PUBLIC_ORIGIN, AUTH_MODE=oidc, OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET,
OIDC_REDIRECT_URI, OWNER_OIDC_ISSUER, OWNER_OIDC_SUB. ACCESS_MODE=owner_only.
Les adaptations de préfixe existant doivent être documentées. Valider au démarrage.
Ne jamais attribuer les données au premier compte ni utiliser l'e-mail comme clé.
Configurer le couple issuer/sub observé pour CHAQUE client ; ne jamais supposer
un sub identique entre clients ou modifier sub_mode après attribution.
Les comptes non propriétaires n'accèdent à aucune donnée historique, fichier,
export, tâche, cache, connecteur ou sauvegarde. Pas de multiutilisateur incomplet.

Admin : identité dédiée, registre issuer/sub provisionné par CLI locale, monté
en lecture seule dans le web. Aucun endpoint de promotion, aucun secret IdP de
provisionnement dans le runtime. MFA TOTP + récupération gérées par Authentik ;
politique MFA et réauthentification récente (max_age 300) pour admin. Le serveur
exige auth_time valide et amr attestant MFA ; claim absent = refus. Pas de shell
ou socket Docker dans l'admin. Inscription fermée/invitation au lancement.
Documenter durée de session, révocation, logout local/global et limites réelles.

## Catalogue et observations

GET /api/catalog/public sur admin.doublemart.fr :
{schemaVersion:1, updatedAt:ISO8601, projects:[{id,name,description:{fr,en},url,order,maturity}]}.
IDs mira, singularity, orbit, quasar ; maturity prototype|beta|stable.
URLs HTTPS exactes des quatre applications ; aucune donnée administrative dans
la projection. Visibilité du catalogue, autorisation et disponibilité distinctes.
Cache serveur portfolio 60 s, timeout 1500 ms, réponse bornée, dernier résultat
valide persistant ; premier démarrage sans service = catalogue local existant.

Rapport technique schemaVersion=1 : project, commit (SHA), generatedAt ISO8601,
tool, kind (ci|audit|deployment|backup|health), status
(ok|failed|unknown|not_run), summary sans données personnelles. Résultats inconnus
ou périmés affichés comme tels ; comparer commit analysé et déployé.
Métriques : noms/types d'écran sur liste fermée, compteurs agrégés, durée/valeur
numérique bornée. Jamais identité, contenu métier, URL brute, query, e-mail,
message, santé, finance, IP/MAC/série/capture caméra. Signaux navigateur non fiables.
Collecte asynchrone par lots <=50, queue <=200, timeout <=1500 ms, <=1 retry,
abandon si indisponible, rétention 30 jours. Aucun secret frontend permanent.
Journal admin durable et transactionnel, distinct des métriques ordinaires.

## UI, données et livraison

FR/EN complets, thèmes clair/sombre/système, choix explicite persistant sans flash.
Conserver graphisme, frameworks, tokens et composants réels. Clavier, focus visible,
WCAG 2.2 AA, reduced-motion, formats locaux. Skeleton = géométrie finale ; données
valides visibles lors d'une actualisation de même ressource, aucun délai artificiel.
Storybook : données fictives, aucun appel production, états/langues/thèmes utiles.

Noindex sur HTML ET X-Robots-Tag (fichiers, erreurs et statique inclus), aucun
sitemap d'indexation. robots.txt permet de lire le noindex des pages publiques.
Limiter entrées/uploads/extraction/appels sortants, requêtes SQL paramétrées,
erreurs publiques sobres, proxies explicitement approuvés, secrets hors Git/logs.
Sauvegarde cohérente avant migration sensible, restauration vérifiée dans une
nouvelle destination. Aucune suppression de données pour réussir un test.

Conserver gestionnaire et lockfile ; format/lint/types/tests/build/Storybook,
audit dépendances + recherche de secrets. CI PR ou push main sans doublon,
actions épinglées par SHA, permissions minimales, timeout, cache lockfile,
annulation CI remplacée et statut requis même si jobs lourds ignorés.
CD manuelle uniquement, inactive sans configuration explicite, sérialisée sans
annuler une migration. Construire une fois, promouvoir l'artefact par digest/SHA,
manifeste de version. Aucun rebuild VPS ni rollback DB implicite.
GET /healthz sans donnée privée ; documenter port interne, volumes, migrations,
image, commit et état de validation. Ne jamais inventer digest ou résultat réel.

## Sources vérifiées

- https://docs.goauthentik.io/add-secure-apps/providers/oauth2/
- https://docs.goauthentik.io/install-config/install/docker-compose/

Authentik garde son issuer par fournisseur ; SSO porté par sa session propre.
Le Compose officiel est la référence ; supprimer le socket Docker si aucun
outpost automatique n'est nécessaire. Dimensionner la RAM avec l'ensemble des
applications, pas seulement Authentik. Installation réelle dans la mission OVH.
