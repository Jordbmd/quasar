# Adaptations sensibles de la V1

Ces adaptations sont conservées sur ONVIF **0.8.3** et go2rtc **1.9.14**. Elles ne sont pas des garanties universelles de compatibilité. Aucun changement de version de ces deux composants pendant la consolidation.

| Adaptation | Raison / limite | Caractérisation |
| --- | --- | --- |
| Agent HTTP source-bound, vérification de route et destination à chaque socket | Éviter une autre interface ou une URL de service tierce ; chemins annoncés sur la caméra seulement | core, integration, onvif-retry |
| `_request`, `_envelopeHeader`, `rawRequest/rawResponse` | La bibliothèque expose imparfaitement ces points ; échappement XML du username sans changer Digest/RTSP, capture du XML, comptage réel des envois | integration (username XML, reset Hard), encoding, osd |
| Sérialisation par caméra et délais après acquisition | Firmware avec un seul worker de configuration ; une lecture en attente ne détruit pas l’opération active | onvif-retry, session |
| Media2 → Media1 quand le service est annoncé mais refusé | Capacité annoncée différente de la capacité réellement utilisable | core, integration, encoding |
| XML de l’encodeur et des OSD conservé | Ne pas perdre attributs et extensions inconnus dans une normalisation | encoding, osd |
| Adaptateur web détecté par structure, login WebLogin DES compatible | Reproduit le format constaté dans le parc ; pas de commande ou marque supposée | vendor-profile, vendor-transport |
| curl macOS pour le web constructeur | Échanges fermés correctement sur les firmwares observés ; body en stdin. Maintenu tant que Node n’est pas validé sur ces appareils | vendor-transport ; Node également exercé via portable-transport |
| Transport Node Linux/Windows | Même POST sans charset, source, annulation, taille et délai bornés ; aucune redirection/reprise dans le transport | portable-transport ; matériel à valider |
| Correction d’horloge DST bornée | Deuxième configuration seulement après réponse positive et erreur précise d’une heure relue. Jamais après timeout. Décalage fixe impose resynchronisation saisonnière | defaults, sync-clock (opération extraite sans changement de protocole) |
| Mode jour / LED | Accusé web insuffisant : résultat vérifié par les lectures disponibles. LED préparées avec l’aperçu ; un échec reste visible | daylight-osd, vendor-profile |
| Proxy RTSP et garde des réponses | Source Ethernet liée, redirections refusées, libération TEARDOWN avant session suivante | integration, playback |

Les réponses externes encore imparfaitement typées sont principalement dans onvif, vendor-profile, osd et video-options. Les rendre `unknown` sans normalisation complète déplacerait le problème en assertions : cette dette reste identifiée. Le dispatch IPC est désormais discriminé et les adaptateurs OS acceptent des valeurs inconnues qu’ils valident avant exposition.

Les commandes web ont été observées sur le parc historique ; les copies des scripts caméra restent privées et exclues du dépôt. Les tests de caractérisation ne prouvent pas leur fonctionnement sur un nouveau firmware.

## Mise à jour des caméras — recherche du 27 octobre 2026

L’interface web relevée sur le parc contient un menu `Upgrade` et une page `Version`. Cela indique une fonction de mise à jour, sans démontrer qu’un nouveau fichier compatible est disponible. Aucun firmware n’a été téléchargé pour installation, envoyé ou appliqué pendant cette recherche. Quasar ne fournit pas encore d’opération de mise à jour.

Le fournisseur est inconnu. Les libellés ONVIF génériques et le numéro de version logiciel ne suffisent pas à identifier la carte, son capteur, sa révision ou ses personnalisations. Aucun firmware plus récent dont la compatibilité avec les caméras actuelles soit confirmée n’a été trouvé. La prochaine étape est une lecture de la référence matérielle complète et du nom complet du firmware dans la page `Version` ; le hub n’était plus détecté lors de cette tentative. Un fichier destiné à une caméra ressemblante ne constitue pas une correspondance validée, et aucune correction du mode jour ne peut être promise.

ONVIF prévoit `UpgradeSystemFirmware` et `StartFirmwareUpgrade`, suivant les capacités annoncées. Le format du fichier reste spécifique au constructeur. Pour étudier une intégration, lire les capacités en premier : `StartFirmwareUpgrade` prépare une mise à jour et ne doit pas servir de simple sonde. Voir la [spécification ONVIF Core 25.06, sections 8.3.9 et 8.3.10](https://www.onvif.org/specs/2506/ONVIF-Core-Spec-v2506.pdf).

La [procédure officielle Anpviz Uprime](https://www.anpvizsupport.com/u_file/file/2404/18/ace4906050.pdf) décrit une mise à jour depuis l’interface web ou un outil constructeur. C’est un exemple de procédure disponible dans cet écosystème, **pas une identification de notre fournisseur ni une validation de ses fichiers pour notre parc**.

Quand une image exacte et sa provenance seront confirmées, effectuer d’abord un essai sur une caméra : sauvegarde de configuration, alimentation PoE stable, vérification de la version après redémarrage, puis contrôle du réseau, du flux, du mode jour, des LED et du profil Sezaam. Le traitement de plusieurs caméras nécessite une identité et une compatibilité vérifiées pour chacune ; aucune nouvelle tentative automatique après un résultat incertain. Un reset éventuellement exigé par le constructeur reste une opération distincte, jamais implicite dans le profil.
