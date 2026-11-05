<!-- Generated rules; version=3.0.2; source=Jordbmd/doublemart-platform@339e4395bb588e24fc1c8218f8bd89d8b0424ba3:docs/standards/core.md -->
# Socle commun

Source entretenue uniquement dans Platform. Les autres dépôts embarquent un export généré autonome ; ne pas corriger ces exports à la main. Lire ce socle à chaque tâche, puis les thèmes utiles. Les contraintes métier et commandes du projet restent dans son AGENTS.md.

- Comprendre le comportement et les frontières avant de modifier. Préserver données, changements locaux, compatibilités utiles et protections. Établir une référence de validation ; implémenter progressivement et vérifier le résultat.
- Ne pas inventer une réussite, une donnée, une mesure, un commit testé ou un artefact livré. Une ancienne CI ne valide pas le nouveau code. Distinguer terminé, partiel, non applicable et intervention extérieure.
- Utiliser des données synthétiques isolées pour les tests. Aucun transfert de code privé, de données ou de secrets vers un indexeur externe. Réutiliser les outils utiles ; justifier une nouvelle dépendance ou abstraction par un problème concret.
- Respecter le périmètre autorisé : pousser une branche ne signifie pas autorisation de fusionner, publier ou déployer. Les protections du dépôt restent actives. Garder une description courte du comportement final, des validations et des limites.

## Git simple, travail en solo

Réutiliser la branche et la PR de l’objectif en cours pour les corrections cohérentes, y compris documentaires. Pas de branche par sous-tâche ni de PR pour chaque détail. Séparer seulement pour isoler un risque ou un chantier indépendant, ou respecter une protection. Commits compréhensibles, sans mélanger des objectifs distincts.

Éviter GitFlow, chaînes de branches, PR empilées et worktrees oubliés. Après intégration vérifiée, examiner la clôture de la PR et le retrait des branches/worktrees temporaires. Comparer aussi le contenu après squash/rebase : ni un nom ni une ancienneté ni une PR fermée ne prouvent l’intégration. Conserver le travail unique, sale, utilisé ou incertain. Une sauvegarde n’autorise pas son abandon. Aucun force-push, reset destructif ou suppression de branche principale pour simplifier une opération.

Exception explicitement retenue pour les règles communes : après activation autorisée, l’automatisation dédiée propage les seuls exports générés par commits directs sur main, sans branche temporaire ni PR de synchronisation. Aucun commit sans changement, aucune mise à jour automatique des branches de travail. Cette exception ne s’étend pas au code applicatif. Les protections et la portée réelle de l’identité d’automatisation sont documentées ; la sélection des fichiers est contrôlée avant chaque écriture.

## Lecture à la demande

- [Architecture](architecture.md) : responsabilités, frontières et erreurs.
- [Sécurité](security.md) : identité, autorisation, secrets, données et indexation.
- [UI/UX](ui-ux.md) : interfaces, états, accessibilité et design existant.
- [Tests](testing.md) : preuves proportionnées, performance et reproductibilité.
- [Statistiques](observability.md) : mesures, rapports et confidentialité.
- [Livraison](delivery.md) : CI, Compose, artefacts, sauvegarde et retour arrière.

Une version antérieure cohérente peut rester sur une branche. Le vérificateur embarqué prouve la cohérence locale, pas l’égalité avec la dernière source distante. Le contrôle central indique séparément la source observée et les versions en retard.
