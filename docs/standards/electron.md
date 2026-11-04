<!-- Generated rules; version=2.0.1; source=Jordbmd/doublemart-platform@7028752ade32c06346120aa02853306579fbb322:docs/standards/electron.md -->
# Complément application de bureau et matériel

Le processus principal détient les accès système et réseau ; renderer et contrats partagés n’importent pas ces dépendances. Valider le contrat IPC côté principal, contrôler exclusivité et cycle de vie, et nettoyer listeners/streams à la fermeture.

Ne pas confondre simulation, lecture système, commande envoyée, écriture confirmée et résultat incertain. Une route réseau non vérifiée n’est pas valide. Confirmation avant opération destructive ; aucune répétition automatique d’une écriture incertaine. Tests système/réseau injectés ou loopback, sans matériel réel implicite.

Secrets matériels chiffrés par le stockage sûr de l’OS lorsque l’utilisateur choisit de les conserver ; aucun repli en clair, localStorage, log ou retour au renderer. Préserver noms de préférences et migrations compatibles.

Paquet fabriqué, signature, notarisation, installation utilisateur et recette matérielle sont des preuves distinctes. Une signature ad hoc n’est pas une signature de distribution. Auditer les modules et binaires réellement embarqués ; les outils de développement ne remplacent pas cet audit. Aucun compte cloud ni télémétrie matérielle ajouté à un produit hors ligne.
