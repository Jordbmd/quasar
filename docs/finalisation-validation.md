# Validation de la reprise — 3 novembre 2026

316 tests Windows et 1 POSIX non applicable ; 317 sur POSIX. 44 stories × 4 variantes, 12 références Windows, 22 RTSP/superviseur.

Les preuves CI et artefacts retenus sont dans [retained-artifacts.json](retained-artifacts.json). Elles identifient le commit réellement construit, distinct du dernier commit documentaire. Les anciennes exécutions ne servent pas à valider un nouveau changement de runtime.

Le laboratoire Platform utilise les vrais runtimes, Authentik et SMTP synthétiques, TLS vérifié et aucun port hôte. Il qualifie SSO/retour, invitations, récupération, expiration/usage unique, MFA et secours, révocation CLI, sessions et limites du logout global. Mira/Singularity/Orbit restent explicitement owner_only.

Six interfaces : web-vitals 6.2.3 standard, vues dédupliquées, transport borné sans contenu personnel ; chaîne réelle collecteur/admin, douze rapports CI/audit sourcés, catalogue visible/masqué/vide/panne/cache persistant. Cinq échantillons par mode/app pour le coût et collecteur réellement arrêté pour le test de panne.

Cinq hôtes asset : vingt contrôles des pages/fichiers/ZIP/Storybook/iframes et accès direct. Compose : réseau DB et Chromium privés, volumes/permissions/health et redémarrage. Douze volumes (applications, identité et Caddy) et PostgreSQL restaurés vers des destinations neuves, vrai login sur les copies ; rollback image et données distincts. Profil Chromium peuplé synthétiquement conservé.

Preuves transverses : doublemart-platform/docs/validation-evidence.json et tests/authentik-integration. Les mesures Docker Desktop ne garantissent pas la capacité du futur VPS. Les tests ciblés et audits ne sont pas une certification générale ; les avis modérés de développement restent visibles. Aucun téléphone, matériel caméra, installation utilisateur, donnée personnelle ou déploiement n’est déclaré testé.

Le portail retenu et son chargement sans reconstruction sont détaillés dans [portal-artifact.json](portal-artifact.json). Docker classique et containerd exposent des identifiants différents : la chaîne OCI archive → manifeste → configuration est vérifiée par hash, ainsi que le label du commit.
