# Réadressage des IP partagées

« Résoudre les conflits » et « Attribuer les IP » ouvrent le même plan par casier : `192.168.1.(casier + 10)`, trié par IP actuelle puis identité. La préparation recherche automatiquement un ciblage constructeur pour les IP partagées. Aucune isolation préalable n’est demandée aux caméras reconnues. Une caméra non reconnue reste bloquée avec une méthode d’isolation proposée séparément.

## Protocole identifié

Le [SDK Linux Anjvision](https://www2.anjvision.com/download/191-cn.html), version NETSDK 2.1 du 25 juillet 2023, expose `IP_NET_DVR_ModifyIPCBySN` (en-tête `NetSDKDLL.h`, exemple `handle_modifyipc` dans `demo/main.cpp`). L’[outil macOS distribué par Anpviz, rubrique U Series](https://www.anpvizsupport.com/download/u-series_c0107) utilise la même famille de messages. Ces sources établissent une commande par **numéro de série constructeur**, distincte des commandes ONVIF ou HTTP à une IP partagée. Elles ne constituent pas une identification commerciale de toutes les caméras du parc.

L’interopérabilité examinée utilise UDP 3001 et les enveloppes `XML_ANJVISION` / `XML_TOPSEE`, avec `SYSTEM_SEARCHIPC_MESSAGE` : recherche 1, modification LAN 2, réponse de recherche 3. La modification contient `IPC_SERIALNUMBER` et `LANConfig`. Aucun binaire du SDK ou de l’outil n’est intégré ni exécuté par Quasar.

`src/main/lan-addressing.ts` utilise une socket liée à l’IPv4 Ethernet et le broadcast calculé du sous-réseau, avec contrôle de route par le service. Aucun réglage réseau, cache ARP ou privilège administrateur du poste n’est modifié. Le mécanisme ne dépend pas de la marque du switch, mais du protocole réellement exposé par les caméras.

## Contrôles

- Deux recherches indépendantes doivent retrouver le même numéro constructeur, la même MAC, la même IP et les mêmes attributs LAN. Une MAC ou un numéro réutilisé, ou des réponses contradictoires, rendent le ciblage indisponible.
- La correspondance avec la fiche utilise sa MAC connue ou le format exact d’endpoint ONVIF observé sur ce protocole (`1419d68a-1dd2-11b2-a105-` suivi de la MAC). Un suffixe arbitraire ne suffit pas. Le numéro constructeur reste distinct du numéro de série ONVIF.
- Le plan expire après deux minutes ; confirmation native, session et génération réseau sont contrôlées. Une nouvelle découverte précède chaque envoi. Les destinations déjà observées par découverte ou voisins Ethernet restent bloquées, y compris une destination partagée.
- Sauvegarde du seul état LAN avant écriture. Un seul datagramme d’écriture, aucune répétition automatique. Seuls IP, masque et DHCP sont changés ; les autres attributs LAN sont conservés. Aucun groupe utilisateur, vidéo ou média n’est envoyé.
- Le succès exige la relecture de l’état LAN complet à la nouvelle IP, la concordance numéro/MAC, une seule identité ONVIF à cette adresse et le voisin Ethernet attendu. Une émission UDP n’est jamais présentée comme un accusé caméra. Un résultat incertain arrête le lot et conserve le blocage des autres écritures.

La découverte constructeur n’est pas une authentification cryptographique. Ce protocole réseau de provisionnement n’exige pas le mot de passe ONVIF ; Quasar ne présente donc pas sa réponse comme une session authentifiée. Les éventuels `UserConfig` des réponses sont ignorés et ne sont ni conservés ni journalisés. Après réadressage, reconnecter les caméras avec leurs identifiants pour leurs réglages habituels.

## Validation

Les tests utilisent des sockets injectées et des systèmes réseau simulés : ciblage, doublons, XML invalide, destination occupée, sauvegarde indisponible, annulation, changement réseau, absence de répétition et relecture complète. Ils ne valident pas tous les firmwares ni une exécution native Windows/Linux.

Validation matérielle du 29 octobre 2026 : quatre caméras ont répondu à la découverte constructeur sur Ethernet, dont deux identités distinctes partageant `192.168.1.132`. Après autorisation explicite, ces deux caméras ont été réadressées vers `.13` et `.14`, sans débranchement. Chaque identité constructeur, MAC, endpoint ONVIF, nouvelle IP, masque et ensemble d’attributs LAN ont été relus. Les deux autres caméras ont conservé leur état LAN. Le premier essai avait été arrêté avant tout envoi en raison d’anciennes entrées ARP ; après leur expiration naturelle, la préparation a été recommencée. Aucune écriture n’a été répétée.
