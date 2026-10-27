# Recette matérielle — refonte Caméras / Diagnostic

## État accepté du parc — 27 octobre 2026

L’utilisateur valide la mise en production des neuf caméras dans leur état actuel. Cette décision concerne les caméras, pas une validation générale de toutes les plateformes de Quasar.

Le bilan du profil Sezaam version 2, sur `.11` à `.19`, indique **50 réglages conformes par caméra**, un mode jour permanent non confirmé et une alarme IO non prise en charge (aucun canal configurable déclaré). Les neuf appareils annoncent le firmware `V3.4.5.2 build 2025-12-12 18:02:59`.

Le journal atteste l’envoi et l’acceptation de la commande constructeur `DayMode`, puis une relecture différente : mode manuel enregistré (`IrcutMode=3`), filtre ONVIF `OFF` au lieu de `ON`. Une nouvelle lecture matérielle des `.11` et `.19` à 10:48 UTC confirme `OFF` dans la réponse XML brute, plusieurs minutes après application, sans aucune écriture lors de ce contrôle. Cela ne permet pas de distinguer une commande jour ignorée d’un retour ONVIF incomplet du firmware. Le réglage reste explicitement non confirmé ; il n’est pas transformé en réussite.

## Procédure de recette

Les tests automatisés utilisent des simulateurs locaux et le vrai relais go2rtc. Aucune caméra physique n’a été configurée pendant cette refonte. À réaliser pour chaque caméra du parc, en enregistrant son firmware et les résultats.

1. Configurer volontairement le Mac depuis les Réglages Système si nécessaire. Ouvrir Quasar : aucun assistant Ethernet, aucune autorisation administrateur et aucune modification du Mac. Vérifier le lancement depuis le lanceur et le thème conservé.
2. Brancher une caméra alimentée au hub Ethernet, directement ou via le routeur/switch, puis lancer la découverte. Aucun sélecteur réseau ne doit apparaître. Tester le branchement du hub après lancement : l’état Ethernet se met à jour sous cinq secondes. Débrancher le hub : les connexions et la vidéo s’arrêtent sans reprise sur le Wi-Fi. Vérifier l’ajout manuel lorsque WS-Discovery est désactivé. Avec plusieurs interfaces, contrôler le trafic source ; un chevauchement seul ne bloque pas la page, une route vers la mauvaise interface doit empêcher la requête concernée.
3. Ouvrir une session commune depuis **Se connecter** et vérifier le nombre de caméras connectées. Passer entre plusieurs caméras puis revenir sur la première sans ressaisir le mot de passe ; les paramètres doivent apparaître. Vérifier fabricant, modèle, firmware, série, MAC. Tester un refus sur une seule caméra, un appareil silencieux et une heure incorrecte : les autres restent utilisables. Les délais et ruptures réseau pendant les lectures peuvent être repris jusqu’à trois fois ; un refus d’authentification ou une écriture interrompue ne doit pas être répété automatiquement. Ajouter une caméra après connexion, relancer une détection, puis vérifier qu’un compte refusé n’est pas retenté sans action explicite. Tester **Réessayer les connexions**, **Modifier les identifiants** et **Déconnecter**. La déconnexion doit arrêter la vidéo et fermer les accès ; un redémarrage de Quasar exige une nouvelle saisie.
4. Comparer les profils, résolutions, FPS, codecs, débits et options aux réglages constructeur. Une capacité absente doit être indiquée sans choix inventés. Vérifier Media1 et Media2 lorsqu’ils existent.
5. Lire un vrai flux. Tester chargement, coupure, reprise, agrandissement, Échap, changement rapide de caméra et navigation Diagnostic. Vérifier que le relais et les sockets disparaissent à l’arrêt, à la fermeture et après un arrêt brutal d’Electron. Vérifier la compatibilité de décodage H.264/H.265 pour chaque profil ; aucun transcodage automatique.
6. Modifier un champ vidéo puis Annuler : aucune écriture. Appliquer un changement supporté : une seule opération, relecture conforme et conservation des autres paramètres. Vérifier les encodeurs partagés et les valeurs limites. Refuser une valeur hors capacités.
7. Lire les objets OSD. Modifier un texte simple et vérifier les couleurs, positions, taille, arrière-plan et extensions inchangés dans l’interface constructeur et dans le flux.
8. Cliquer Désactiver l’OSD puis Annuler : aucune suppression. Recommencer et Appliquer : sauvegarde locale, DeleteOSD, GetOSDs vide pour les objets visés et disparition réelle des incrustations dans le flux produit. Aucun cache visuel du lecteur ne doit masquer un échec.
9. Restaurer les OSD : vérifier tous les paramètres, les nouveaux tokens éventuels et l’absence de doublons. Répéter un cycle suppression/restauration. Tester un OSD modifié extérieurement et un firmware refusant DeleteOSD ou CreateOSD : résultat explicite et accès web disponible.
10. Caméra physiquement isolée : saisir un casier ou une IP libre et changer adresse/masque. Vérifier la confirmation, la perte temporaire, la redécouverte et l’identité après reconnexion. Casier 1 → `.11`, casier 25 → `.35`. Tester un changement de masque sans changement d’IP.
11. Vérifier passerelle et DNS, y compris suppression volontaire, puis DHCP avec un serveur disponible. Tester l’absence de serveur DHCP : ne jamais annoncer une nouvelle configuration vérifiée sans relecture.
12. Tester une adresse occupée, deux caméras de même IP et une identité contradictoire. Vérifier le refus d’écriture. Un ping sans réponse ne prouve pas qu’une IP est libre.
13. Interrompre une réponse après écriture. Vérifier le résultat incertain, l’absence de renvoi automatique et l’obligation de reconnecter et relire. Si un redémarrage est requis, il doit rester manuel.
14. Lancer Diagnostic : comparer les dix contrôles aux observations réelles, dont les états Non pris en charge et Non testé. Le succès vidéo indique seulement des données reçues, pas une mesure de fluidité.
15. Copier et exporter les journaux. Vérifier horodatage, caméra et niveau, puis rechercher les identifiants de test : aucun mot de passe ou URL avec authentification.
16. Débrancher l’adaptateur ou changer son adresse manuellement : anciennes connexions fermées, aperçu arrêté, état actualisé. Reconnecter ensuite sans étape obligatoire de validation Ethernet. Quitter l’application : les réglages réseau du Mac restent ceux de l’utilisateur.

| Référence | Firmware | Date | Réseau / vidéo | OSD / restauration | Diagnostic |
| --- | --- | --- | --- | --- | --- |
| Caméra à identifier | À relever | — | Non testé | Non testé | Non testé |

## Recette après consolidation multiplateforme — à exécuter, pas encore validée

- Sur chaque OS cible, relever version/architecture, droits standard, adaptateur et firmware. Vérifier d’abord l’absence d’interface, une permission refusée, puis l’arrivée du hub, une carte désactivée, plusieurs Ethernet et un VPN. Aucun de ces cas ne doit imposer les droits administrateur ni modifier le réseau du poste.
- Sur une copie sauvegardée des données, tester le premier lancement autonome et la migration depuis `.runtime`, profil local modifié, préférences, OSD et historiques compris. Relancer et vérifier qu’aucune donnée n’est écrasée. Garder le lanceur Mac existant jusqu’à validation de l’autorisation réseau du nouveau paquet.
- Vérifier WS-Discovery physique, adresse source/route et voisins, puis A → B → A pendant une réponse lente. Relever la latence réelle au chronomètre ; le succès logiciel ne prouve pas sa réduction sur le parc.
- Comparer chaque écriture avec l’interface constructeur et l’image réelle : résolution maximale, propriétés XML conservées, OSD, mode jour, LED réellement allumées. Distinguer commande acceptée et relecture conforme. Débrancher pendant l’écriture et vérifier qu’elle n’est jamais répétée automatiquement.
- Arrêter le lecteur, quitter normalement puis tuer le processus principal : aucun relais/sous-processus restant. Vérifier aussi cette propriété sur Windows avec son mécanisme d’arrêt natif et un chemin contenant espaces/accents.
- Sur caméras de test explicitement dédiées : conflit d’IP et isolation physique, adressage en lot `casier + 10`, et reset usine avec confirmations. Aucun reset de production nécessaire pour valider les autres fonctions.

## Observation réelle du 27 octobre 2026 — après rebranchement

Contrôle limité sur le Mac de l’utilisateur : hub `en9`, IPv4 `192.168.1.2/24`, lien 1000baseT full-duplex. Le NetworkGuard du code consolidé confirme les routes vers `.11`, `.12`, `.15`, `.16`, `.17`, `.18` et `.19` par cet Ethernet, malgré le sous-réseau Wi-Fi commun.

Dans l’application déjà ouverte (interface antérieure à la consolidation), une nouvelle détection trouve ces sept caméras et la connexion commune réussit pour 7/7. Les fiches `.15` et `.12` chargent leurs données réseau, vidéo et OSD ; aller-retour `.15 → .12 → .15` sans blocage observé et retour des paramètres en mémoire. Une image réelle est visible sur `.15`. Cet essai ne mesure pas la latence de bout en bout.

Aucun profil appliqué, adressage ou reset déclenché. L’aperçu automatique exécute sa préparation habituelle de l’éclairage ; l’allumage physique des LED n’a pas été vérifié séparément. Pas de remplacement du lanceur, de redémarrage de l’application, ni de validation matérielle complète du nouveau paquet autonome. Linux/Windows, écritures et migration réelle restent hors de cette observation.
