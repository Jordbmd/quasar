<!-- Generated rules; version=3.0.2; source=Jordbmd/doublemart-platform@339e4395bb588e24fc1c8218f8bd89d8b0424ba3:docs/standards/architecture.md -->
# Architecture

- Séparer rendu, orchestration métier et accès aux données aux endroits où les dépendances, erreurs ou cycles de vie diffèrent réellement. Pas de découpe motivée uniquement par la taille d’un fichier.
- Contrats explicites et validation aux frontières HTTP, IPC, fichiers et services distants. Garder une seule règle métier faisant autorité ; les contrôles UI améliorent l’usage mais ne remplacent pas les contrôles serveur.
- Une opération prépare, confirme si nécessaire, exécute puis rapporte son résultat. Éviter de consommer un identifiant de reprise ou de persister un succès avant que l’opération soit engagée. Transaction pour les écritures qui doivent réussir ensemble.
- Annulation, délai dépassé, résultat incertain et échec confirmé sont distincts. Une annulation de lecture ne prouve pas l’annulation d’une écriture distante. Pas de répétition automatique d’une écriture non idempotente.
- Donner un propriétaire aux effets : événements, observers, timers, requêtes, streams et connexions sont libérés à la fin du cycle de vie. Rejeter les réponses obsolètes et borner files, tailles et concurrence.
- Limiter états globaux et dépendances circulaires. Préférer modules existants, fonctions explicites et contrats étroits à un bus d’événements, framework d’injection, repository générique ou nouveau service sans bénéfice démontré.
- Partager scripts et contrats seulement lorsqu’ils ont le même sens et un propriétaire clair. La centralisation des règles n’impose ni monorepo ni bibliothèque runtime commune.
- Supprimer code, dépendances et compatibilités uniquement après preuve d’inutilité. Préserver migrations, formats historiques et provenance nécessaires. Mettre à jour la carte d’architecture avec le code final.
