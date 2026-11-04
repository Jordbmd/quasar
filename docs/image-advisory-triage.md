# Avis des images — revue bornée du 4 novembre 2026

Le rapport Trivy complet est conservé, sans filtrage de sévérité ni suppression
des avis sans correctif. Le contrôle échoue sur les avis hauts/critiques sauf les
couples précis CVE/paquet Debian ci-dessous, uniquement s'ils n'ont pas encore de
correctif publié, et jusqu'au 5 décembre 2026. Un avis npm/Python, un nouveau CVE,
un autre paquet ou une correction disponible n'obtient pas cette exception.

Les dépendances globales npm non utilisées par les commandes runtime Node sont
retirées des images finales après installation. Ce n'est pas une suppression
d'une fonctionnalité de l'application. Les étapes de construction conservent leur
gestionnaire de paquets. Les mises à jour Debian restent dans la même distribution
et sont incorporées en CI ; aucune installation en démarrage de production.

| Avis                                                                  | Analyse du contexte runtime                                                                                                                                                                                                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CVE-2023-45853, zlib1g                                                | Faux positif du paquet binaire : [Debian](https://security-tracker.debian.org/tracker/CVE-2023-45853) précise que contrib/minizip n'est pas construit par zlib dans Bookworm. Ne couvre pas un paquet minizip/pyminizip distinct.        |
| CVE-2025-69720, ncurses                                               | Bibliothèque/outils terminal ; aucun terminal ni chargement de terminfo fourni par une requête dans ces runtimes. Avis conservé, pas une preuve d'absence de toute exploitation locale.                                                  |
| CVE-2026-16742, libsystemd0/libudev1                                  | Concerne systemd-homed, qui ne s'exécute pas dans les conteneurs applicatifs. Ne vaut pas pour l'hôte ou l'image Authentik.                                                                                                              |
| CVE-2026-41992, gzip                                                  | Décompression LZH par le binaire gzip ; les uploads utilisent les parseurs JS/Python et ne lancent pas ce programme sur un contenu utilisateur.                                                                                          |
| CVE-2026-53613 / 53615 / 78410, util-linux et bibliothèques associées | Opérations de montage ou analyse de partitions ; pas de périphérique hôte, CAP_SYS_ADMIN, SUID efficace ou appel métier à mount. UID non root, cap_drop ALL, no-new-privileges et filesystem RO sont des préconditions de cette analyse. |
| CVE-2026-54369, libacl1                                               | Manipulation locale d'ACL avec privilèges ; aucune API applicative ne délègue l'ACL d'un chemin fourni par une requête. Les protections conteneur précédentes restent nécessaires.                                                       |
| CVE-2026-9538, perl-base                                              | Archive::Tar de Perl n'est pas le parseur utilisé pour les imports ; aucune exécution Perl sur archive reçue.                                                                                                                            |

Les avis se consultent dans le [suivi Debian](https://security-tracker.debian.org/tracker/).
Ces conclusions de non-exposition du chemin vulnérable reposent sur les commandes
runtime, les points d'entrée de parsing et les protections effectives examinées.
Elles ne constituent pas une exploitation testée ni une correction du paquet.
Tout nouveau parseur natif, subprocess, montage, changement de privilèges ou de
distribution exige une nouvelle revue avant de conserver ces exceptions.

Le passage du contrôle ne signifie pas « zéro vulnérabilité ». La vérification
hebdomadaire des dépendances complète les scans d'images des CI applicatives.
Cette liste ne s'applique ni à l'hôte Debian, ni à Authentik, Caddy ou PostgreSQL.
