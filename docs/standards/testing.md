<!-- Generated rules; version=3.0.2; source=Jordbmd/doublemart-platform@339e4395bb588e24fc1c8218f8bd89d8b0424ba3:docs/standards/testing.md -->
# Tests et preuves

- Avant un refactoring, relever commit, état local et résultats de référence. Vérifier le comportement touché avant/après, pas seulement la compilation. Tester les invariants et cas de panne utiles, pas recopier l’implémentation dans un test.
- Contrôles proportionnés : contrats et calculs unitaires, intégrations aux frontières, parcours navigateur/IPC pour les états et interactions réels. Réutiliser les outils présents. Ne pas retirer un contrôle de sécurité ou assouplir une assertion pour obtenir un succès.
- Fixtures synthétiques, bases et réseaux isolés, ports documentés. Aucun compte, profil, document personnel ou matériel réel implicite. Les dépendances externes sont simulées au point de frontière, sans mode bypass dans le runtime.
- A11Y : scans Axe sur application et composants réels, contrastes, clavier/focus et réduction du mouvement. Documenter les résultats incomplets et leurs vérifications complémentaires. Les snapshots seuls ne prouvent pas l’accessibilité.
- Références visuelles indépendantes conservées ; ne pas régénérer depuis une régression pour la faire disparaître. Ne pas ajouter une attente arbitraire pour cacher une course.
- Mesurer les parcours touchés sur un corpus synthétique reproductible : paramètres, tailles, nombre d’échantillons, environnement, métrique, avant/après et limites. Une durée de suite de tests n’est pas une mesure de latence produit. Aucun gain nul ou de tokens sans mesure.
- Séparer suite locale complète, sous-ensemble CI, OS réellement exécuté, simulation, artefact construit et installation réelle. Conserver commande, commit et résultat. Les anciens résultats restent historiques.
- Après modification transverse, exécuter les intégrations appropriées, y compris identité, collecte, catalogue, sauvegarde ou retour arrière si touchés. Refaire les preuves nécessaires plutôt que reporter un test synthétique à l’arrivée d’un serveur.
- Réutiliser les checklists existantes : terminé avec preuve ; partiel avec manque précis ; non applicable justifié ; intervention extérieure identifiée. Audits ciblés et seuil de dépendances ne constituent pas une certification générale.
