# Reprise du 3 novembre 2026

Fusion de main `538a8c7` dans la préparation, sans fusion de la PR. Conservation
des workflows Box et IP, de safeStorage opt-in, des confirmations réseau et des
protections Electron. Les anciennes CI ne valident pas cette fusion.

Preuves locales : `validate:software` réussit (316 tests réussis, un test POSIX
non applicable sous Windows), frontières/lint/types/format/secrets, 130 contrôles
de contraste, formulaires et scénario Box. Electron isolé : persistance langue,
thème, bibliothèque, import worker, IPC invalide et HTTPS externe refusés.
Storybook couvre 44 stories en quatre combinaisons FR/EN et clair/sombre.
Douze comparaisons visuelles et reflow réussis après revue documentée des huit
pages modifiées par main. Portail public et technique : huit parcours Axe,
clavier, thèmes, langues, mobile, sans requête externe.

Imports : plafond de décompression 16 Mio par entrée / 64 Mio total,
1 000 entrées uniques avant SheetJS ; tests archive compressée excessive,
archive tronquée et nombre d'entrées. Aucune extraction sur disque.

Composants distribués : Electron 44.9.3 et go2rtc reconstruits depuis le source
1.9.15 épinglé. L'ancien binaire 1.9.14 contenait Go 1.25.6 et de nombreuses
versions signalées. Le binaire upstream 1.9.15 laissait trois avis ; le rebuild
Go 1.27.3 avec les locks corrigés passe OSV et govulncheck local sans avis connu.
Les 22 tests ciblés RTSP/superviseur passent. Ce résultat est daté et ne constitue
ni une certification générale ni une recette caméra.

L'installateur Windows construit localement est réellement inspecté par
Get-AuthenticodeSignature : **NotSigned**. Le manifeste enregistre `unsigned`.
L'arbre étant modifié avant commit, ce paquet porte `workingTreeDirty:true` :
il ne constitue pas l'artefact final d'un commit propre. La CI native et ses
manifestes restent à confirmer après push. Aucune installation utilisateur,
signature de distribution, notarisation ou release n'a été réalisée.

Portail : runtime dédié, collecte facultative avec secret serveur, Web Vitals
standards et métriques bornées. Tests HTTP des champs privés, origines, tailles,
accès aux fichiers et panne collecteur. La chaîne complète vers l'admin et le
coût navigateur restent à valider dans le laboratoire Platform.

La checklist reste l'autorité sur le périmètre incomplet de la mission.
