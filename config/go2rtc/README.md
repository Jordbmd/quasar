# Relais vidéo reconstruit

Source upstream : go2rtc v1.9.15, commit
`7c05066c90ab6ad1fccb506d5f0408aa31ebe60f`, somme de module Go
`h1:2WfyfWWVJCvcedlSQDpnyBZ1LlIOMvkWVc1BiiPNAJc=`.

Le binaire officiel contient encore des versions signalées par GO-2026-6860,
un second avis x/net et GO-2026-5932. Les fichiers Go verrouillés ici mettent
x/net à 0.62.0 et x/crypto à 0.58.1-0.20261009181718-2f1f834330b2.
Le code applicatif upstream est conservé. Go 1.27.3, CGO désactivé,
`-trimpath -buildvcs=false -mod=readonly -ldflags '-s -w'`.

`npm run setup:video` nécessite ce compilateur (ou `QUASAR_GO` désignant son
exécutable). La CI l'installe avec une action épinglée. Le compilateur ne fait
pas partie du runtime. Chaque cible inclut le checksum du binaire construit,
les sommes des locks, le commit source et la licence upstream. Le hook de
packaging contrôle le binaire effectivement copié. Aucun repli vers l'ancien
binaire officiel n'est autorisé.

Validation : audit OSV des modules extraits du binaire, govulncheck local et
tests RTSP/superviseur synthétiques. Cela ne valide aucune caméra matérielle.
