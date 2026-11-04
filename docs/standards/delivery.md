<!-- Generated rules; version=2.0.0; source=Jordbmd/doublemart-platform@3512cd37201c3fd2dec7ab864c7acccb24ce2ea5:docs/standards/delivery.md -->
# CI et préparation de livraison

- Docker Compose pour cette phase, sans chantier Kubernetes. Noms de service/alias uniques ; seul le proxy d’entrée publie les ports requis. Bases et navigateurs automatisés sur des réseaux distincts.
- Configurations explicites, secrets hors images, volumes/droits/UID, healthchecks sans données privées et comportement au redémarrage vérifiés. Documenter Caddy et DNS/TLS, y compris les certificats des sous-sous-domaines ; documentation ne signifie pas configuration publique effectuée.
- CI : gestionnaire et lockfile conservés, actions épinglées, permissions minimales, caches liés aux fichiers de verrouillage, limites de durée, annulation des validations remplacées, rétention adaptée. Pas de doublon PR/push inutile. Les contrôles requis restent présents même si un job coûteux est conditionnel.
- Jobs coûteux déclenchés selon le risque et le code touché ; ne pas systématiquement imposer toutes les suites exhaustives à chaque correction. Supprimer seulement des doublons prouvés, pas les tests gênants.
- Construire les images en CI, promouvoir les mêmes artefacts par référence immuable sans rebuild sur le serveur. Toute nouvelle modification de runtime nécessite son propre artefact validé.
- Distinguer commit source, commit construit (dont merge synthétique de PR), image/paquet, checksum, publication et déploiement. Vérifier archive, manifeste et identité de l’image ; ne pas inventer un digest de registre pour une image locale.
- Sauvegarde cohérente avant migration : arrêter/coordonner les écrivains, inclure fichiers et profils nécessaires, sauvegarde logique des bases concernées. Restaurer dans des destinations neuves et vérifier intégrité et parcours. Retour arrière image et données sont deux opérations distinctes ; conserver les originaux.
- CD manuelle, inactive sans configuration explicite, sérialisée et sans annuler une migration. Aucune fusion, release, modification DNS, publication ou mise en production déduite de la réussite d’une CI.
- Les scripts de synchronisation privilégiés exécutent uniquement le code canonique de confiance. Ils peuvent lire et modifier les exports sélectionnés, jamais exécuter le code du projet cible avec leurs secrets.
