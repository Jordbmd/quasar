export function videoError(value: unknown): string {
  const text = String(value);
  if (/timeout|timed out|ETIMEDOUT/i.test(text))
    return "La caméra n’a pas répondu à temps au flux vidéo. Vous pouvez relancer la lecture ou choisir une autre caméra.";
  if (/401|403|wrong user\/pass|not authorized|unauthorized/i.test(text))
    return "La caméra a refusé les identifiants du flux vidéo. Vérifiez la connexion aux caméras.";
  if (/codec|unsupported|not supported|no compatible/i.test(text))
    return "Ce profil vidéo n’est pas compatible avec le lecteur. Essayez un autre flux.";
  return "Le flux vidéo est indisponible. Relancez la lecture ou choisissez un autre profil.";
}
