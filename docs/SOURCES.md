# Références techniques consultées

Les API ont été confrontées à la documentation officielle et au code de la **version effectivement installée**, pas à des noms de méthodes supposés.

- Electron, sécurité : https://www.electronjs.org/docs/latest/tutorial/security — isolation du contexte, sandbox, preload, validation de l’émetteur IPC, refus des fenêtres et navigations externes.
- Electron, IPC : https://www.electronjs.org/docs/latest/tutorial/ipc
- Apple, networksetup : https://support.apple.com/en-lamr/guide/remote-desktop/apdd0c5a2d5/mac et manuel local `man networksetup` sur macOS 27.0.1.
- ONVIF Node : https://github.com/agsh/onvif/tree/v0.x — version npm installée **0.8.3** (`Cam`, callbacks). La documentation principale décrit une autre génération d’API ; elle n’est pas utilisée comme contrat de cette version.
- Sources installées : `node_modules/onvif/lib/cam.js`, `device.js`, `media.js`, `imaging.js`, `discovery.js`, `index.d.ts`.
- WS-Discovery et ONVIF : https://www.onvif.org/profiles/specifications/ ; enveloppe de découverte confrontée à l’implémentation du projet ONVIF ci-dessus. Une petite implémentation UDP locale évite le repli de la bibliothèque vers une interface par défaut et corrèle les réponses avec le MessageID.
- go2rtc **v1.9.14** : https://github.com/AlexxIT/go2rtc/releases/tag/v1.9.14
- Service média ONVIF : https://www.onvif.org/specs/srv/media/ONVIF-Media-Service-Spec-v242a.pdf — GetOSDs, GetOSDOptions, SetOSD, DeleteOSD et CreateOSD. Les méthodes de sérialisation de la bibliothèque ne préservent pas tous les champs : l’application conserve le XML complet pour SetOSD/CreateOSD et l’encodage vidéo.
- Schéma officiel : https://www.onvif.org/ver10/schema/onvif.xsd — VideoEncoder2ConfigurationOptions, FrameRatesSupported, GovLengthRange, ProfilesSupported, ConstantBitRateSupported, types Media1 et réseau IPv4. Consulté le 19 octobre 2026.
- Accessibilité : https://www.w3.org/TR/WCAG22/ ; contrôles automatiques avec https://github.com/dequelabs/axe-core et calcul local de luminance relative.
- Police Inter : https://github.com/rsms/inter ; police variable et licence OFL conservées dans `src/renderer/assets/`.
- API streams, `PATCH` en mémoire : https://github.com/AlexxIT/go2rtc/blob/v1.9.14/internal/streams/api.go et https://github.com/AlexxIT/go2rtc/blob/v1.9.14/internal/streams/streams.go
- Configuration sans fichier enregistrable : https://github.com/AlexxIT/go2rtc/blob/v1.9.14/internal/app/config.go
- RTSP TCP / absence de backchannel : https://github.com/AlexxIT/go2rtc/blob/v1.9.14/internal/rtsp/rtsp.go
- Protocole MSE WebSocket : https://github.com/AlexxIT/go2rtc/tree/v1.9.14/www et documentation API https://github.com/AlexxIT/go2rtc/blob/master/internal/api/README.md

Le wrapper ONVIF utilise l’agent HTTP prévu par la bibliothèque pour fixer l’adresse source. Un point interne `_request`, identifié dans le code 0.8.3 et couvert par les tests d’intégration, ajoute le contrôle réseau à chaque requête. Toute mise à jour de cette dépendance doit refaire ces tests et une recette matérielle.
