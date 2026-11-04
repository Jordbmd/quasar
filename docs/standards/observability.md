<!-- Generated rules; version=2.0.1; source=Jordbmd/doublemart-platform@7028752ade32c06346120aa02853306579fbb322:docs/standards/observability.md -->
# Statistiques et rapports

- Mesures techniques asynchrones et bornées ; elles ne participent jamais à une décision de sécurité. Une panne de collecte ne bloque pas le parcours métier.
- Utiliser la bibliothèque Web Vitals standard pour LCP/INP/CLS. Dédupliquer les vues par document/transition pertinente. Noms d’écran et catégories sur liste fermée, compteurs agrégés et valeurs numériques bornées.
- Ne transmettre ni identité, contenu utilisateur, URL brute/query, santé, finance, message, IP/MAC/série ni image caméra. Aucun secret frontend permanent. Signaux navigateur non fiables.
- Bornes communes : file au plus 200, lots au plus 50, délai au plus 1500 ms, au plus une nouvelle tentative ; abandon en panne. Rétention agrégée 30 jours calendaires, purge vérifiée. Adapter un contrat uniquement de façon explicite et testée.
- Rapports datés avec source, commit exact, outil, périmètre et résultat. Distinguer inconnu, périmé, échoué, non exécuté et réussi ; ne pas transformer une absence de donnée en zéro ou succès. Commit analysé et livré peuvent différer.
- Le workflow de rapports lit uniquement les métadonnées GitHub depuis du code de confiance ; aucun checkout ni exécution du code ou des artefacts d’une PR avec un secret de transmission. Sans configuration de transmission : conserver l’artefact et indiquer non exécuté.
- Catalogue SSR : cache borné, timeout, dernier état valide et réponse vide valide ; distinguer visibilité, autorisation et disponibilité. Journal administratif durable et transactionnel, distinct des agrégats temporaires.
- Mesurer le coût réel de collecte activée/désactivée sur le même scénario. Documenter CPU, mémoire, latence et limites de l’environnement ; aucune garantie de capacité serveur à partir d’un poste local.
