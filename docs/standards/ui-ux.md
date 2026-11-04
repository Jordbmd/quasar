<!-- Generated rules; version=2.0.0; source=Jordbmd/doublemart-platform@3512cd37201c3fd2dec7ab864c7acccb24ce2ea5:docs/standards/ui-ux.md -->
# Interfaces et expérience

- Conserver l’identité graphique, les contenus validés, tokens et composants réels. Hiérarchie lisible, actions utiles, textes courts, densité adaptée ; pas de décoration ni de slogan inventé pour masquer un manque fonctionnel.
- Les principes pertinents d’Unslop et des références déjà évaluées servent de questions de revue : clarté, cohérence, continuité des parcours, absence d’ornements gratuits. Aucune référence esthétique n’est une règle absolue ni une raison de remplacer un design validé.
- FR/EN pour les textes applicatifs, formats de dates/nombres selon la langue. Ne pas traduire contenu utilisateur, noms, valeurs métier ni identifiants techniques.
- Clair/sombre/système, choix explicite persistant et appliqué avant rendu. Menus, champs et focus doivent respecter les mêmes tokens.
- Chargement, vide, erreur avec reprise, succès et rafraîchissement sont distincts. Skeleton correspondant à la géométrie finale. Afficher immédiatement une réponse rapide, sans délai artificiel.
- Conserver les données valides lors d’une actualisation de la même ressource. Lors d’un changement de période, compte ou sélection, ne pas présenter l’ancienne donnée comme celle de la nouvelle ressource. Annuler ou ignorer les réponses obsolètes.
- Clavier, ordre de focus, retour de focus, noms accessibles, contrastes clair/sombre, mobile/zoom et prefers-reduced-motion. Les animations non essentielles doivent pouvoir disparaître sans retirer le contenu ni les actions.
- Storybook réutilise les composants rendus par l’application, avec données synthétiques et états utiles. Aucun appel de production. Un test d’identité externe ne prouve pas l’accessibilité de l’application.
