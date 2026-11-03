# Références Windows / Chrome

Ces douze images proviennent du commit initial **266ed1bc6c5b95a513e726acf4e312b7903b0569**, reconstruit indépendamment dans une archive Git locale le 3 novembre 2026. Elles ne sont pas générées depuis la branche de préparation production. Les fixtures sont simulées, sans données caméra réelles.

Environnement : Windows 11 x64 (10.0.26200), Node 24.22.1, Playwright 1.64.1, Google Chrome signé 156.0.8078.74, viewport 1448 × 1086, échelle 1, locale fr-FR, fuseau Europe/Paris, reduced-motion. Les polices locales Inter, Sora et JetBrains Mono ont les mêmes octets que le commit initial ; leurs SHA-256 et ceux des captures figurent dans `provenance.json`.

La reconstruction utilise les sources, stories, configurations, assets et polices de `git archive 266ed1b`, puis les dépendances du lockfile inchangé et `storybook build`. Le script visuel du commit initial produit les captures avant leur copie dans ce dossier. La comparaison indépendante avec la branche modifiée a confirmé **12 fichiers PNG identiques octet par octet**. Les anciennes références conservées au niveau parent échouaient déjà sur 10/12 cas avec cet environnement ; leurs ratios sont documentés dans le manifest de provenance.

Le contrôle sélectionne ce dossier sous Windows. Les seuils existants restent un delta de canal supérieur à 20 et au maximum 0,001 des pixels modifiés ; les vérifications de reflow restent actives. La CI utilise Chrome sur Windows pour ce contrôle bloquant. macOS/Linux conservent les autres vérifications natives, sans prétendre valider ces références Windows. Une évolution de Chrome ou du rendu de Windows peut produire un écart : examiner le diff et sa provenance avant toute calibration, sans augmenter les seuils ni effacer une régression.

Une mise à jour future des références exige une source explicitement choisie, une inspection des captures et une provenance actualisée. `test:visual:update` n'est jamais exécuté en CI.
