import type { FieldTrace } from "./profile-journal";
import type { Camera } from "./types";
import { vendorFieldIds } from "./vendor-profile";
export type DefaultValue = string | number | boolean;
export type DefaultField = {
  id: string;
  group: string;
  label: string;
  value: DefaultValue;
  options?: string[];
  unit?: string;
  note?: string;
  automatic?: boolean;
};
const fields: DefaultField[] = [];
function add(
  group: string,
  id: string,
  label: string,
  value: DefaultValue,
  extra: Partial<DefaultField> = {},
) {
  fields.push({ group, id, label, value, ...extra });
}
add("Date et heure", "syncTime", "Mettre à l’heure du Mac", true, {
  automatic: true,
  note: "Synchronisation ponctuelle au moment de l’application, puis relecture UTC (tolérance de 10 secondes). Aucun serveur NTP requis.",
});
add("Date et heure", "clockTimezone", "Fuseau horaire", "Europe/Paris", {
  automatic: true,
  options: ["Europe/Paris", "UTC"],
});
add("Ethernet", "allSubnetOnvif", "All Subnot ONVIF", false, {
  note: "Libellé constructeur conservé. Ce réglage n’est pas assimilé à une désactivation du service ONVIF.",
});
for (const [id, label, value, automatic] of [
  ["brightness", "Luminosité", 128, true],
  ["colorSaturation", "Saturation", 128, true],
  ["sharpness", "Netteté", 128, true],
  ["contrast", "Contraste", 128, true],
  ["backlight", "Contre-jour (Backlight)", 50, false],
  ["hlc", "HLC", 100, false],
  ["denoise2d", "Réduction du bruit 2D", 128, false],
  ["denoise3d", "Réduction du bruit 3D", 128, false],
  ["overexposure", "Prévention de surexposition", 80, false],
] as const)
  add("Image", id, label, value, {
    automatic,
    note: automatic
      ? "Valeur brute constructeur. Appliquée uniquement si la plage annoncée par la caméra l’accepte, sans conversion d’échelle."
      : undefined,
  });
add("Image", "awbMode", "Balance des blancs", "MANUAL", {
  options: ["MANUAL", "AUTO"],
});
for (const color of ["Red", "Green", "Blue"])
  add("Image", `awb${color}`, `AWB ${color} Gain`, 128);
add("Image", "videoFormat", "Fréquence secteur", "50HZ", {
  options: ["50HZ", "60HZ"],
});
for (const [id, label] of [
  ["antiFlicker", "Anti-scintillement forcé"],
  ["horizonFlip", "Retournement horizontal"],
  ["verticalFlip", "Retournement vertical"],
  ["defog", "Débrumage"],
])
  add("Image", id, label, false);
add("Image", "defogRange", "Intensité du débrumage", 128);
add("Image", "wdrRange", "Plage WDR", 128);
for (const period of ["day"]) {
  add(
    "Image",
    `${period}ShutterMode`,
    `Obturateur ${period === "day" ? "jour" : "nuit"} — mode`,
    "Manual",
    { options: ["Manual", "Auto"] },
  );
  add(
    "Image",
    `${period}ShutterSpeed`,
    `Obturateur ${period === "day" ? "jour" : "nuit"} — vitesse`,
    10,
    {
      note: "Valeur constructeur 10 ; unité à confirmer, aucune conversion en durée d’exposition.",
    },
  );
}
add("Image", "videoMode", "Mode vidéo", "Forced Frame Rate", {
  options: ["Forced Frame Rate", "Auto"],
});
add("Éclairage", "ircutMode", "Mode jour permanent", "Manual → Day Model", {
  automatic: true,
  options: ["Manual → Day Model"],
  note: "Mode nuit désactivé. Passage en mode jour et relecture du filtre infrarouge ; les LED sont commandées séparément à la lecture.",
});
add("Éclairage", "lightThreshold1", "Light ON Brightness", 1.5, {
  note: "Sur l’API web reconnue, 1,50 correspond à l’option 17. Seules les valeurs de la liste constructeur sont acceptées.",
});
add("Éclairage", "lightThreshold2", "Light OFF Sensitivity", 36);
add("Éclairage", "lightMode", "Mode d’éclairage", "Pure white light", {
  options: ["Pure white light", "Infrared", "Auto"],
});
add("Éclairage", "lightImage", "Option d’image", "Normal");
add("Éclairage", "lightBrightnessMode", "Gestion de la luminosité", "Manual", {
  options: ["Manual", "Auto"],
});
add("Éclairage", "lightBrightness", "Luminosité de l’éclairage", 100, {
  unit: "%",
  note: "Intensité utilisée par le profil. La lecture active les LED blanches à 100 %.",
});
add("OSD", "osd", "Affichage à l’écran (OSD)", false, {
  automatic: true,
  note: "Activation ou désactivation avec sauvegarde et relecture.",
});
add("Encodage vidéo", "mainStream", "Flux principal", true);
add("Encodage vidéo", "codec", "Codec", "H264", {
  automatic: true,
  options: ["H264", "H265", "JPEG", "MPEG4"],
});
add("Encodage vidéo", "resolution", "Résolution", "Résolution maximale", {
  automatic: true,
  options: [
    "Résolution maximale",
    "3MP",
    "2304 × 1296",
    "2048 × 1536",
    "1920 × 1080",
    "2560 × 1440",
    "3840 × 2160",
  ],
  note: "Résolution maximale : plus grand nombre de pixels annoncé par chaque caméra pour le codec choisi. La définition retenue apparaît dans le bilan. Les contraintes de cadence et de débit restent vérifiées.",
});
add("Encodage vidéo", "bitrateControl", "Contrôle du débit", "CBR", {
  automatic: true,
  options: ["CBR", "VBR"],
});
add("Encodage vidéo", "govLength", "Intervalle I-Frame", 25, {
  automatic: true,
  unit: "images",
});
add("Encodage vidéo", "bitrate", "Débit cible", 5120, {
  automatic: true,
  unit: "kb/s",
});
add("Encodage vidéo", "fps", "Cadence", 25, {
  automatic: true,
  unit: "images/s",
});
add("Encodage vidéo", "customQP", "Custom QP", false);
add("Encodage vidéo", "qpMin", "QP minimum", 30);
add("Encodage vidéo", "qpMax", "QP maximum", 51);
add("Encodage vidéo", "h264Profile", "Profil H.264", "High", {
  automatic: true,
  options: ["Baseline", "Main", "Extended", "High"],
});
add("Encodage vidéo", "subStream", "Flux secondaire", false);
add("Audio", "audioEncode", "Encodage audio", false);
add("Audio", "audioAmplify", "Amplification AudioIn", false);
add(
  "Confidentialité et stockage",
  "privacyMask",
  "Masques de confidentialité",
  "Clear",
  { options: ["Clear", "Conserver"] },
);
add("Confidentialité et stockage", "localStorage", "Stockage local", false);
for (const [id, label] of [
  ["motionAlarm", "Alarme de mouvement"],
  ["inputAlarm", "Alarme d’entrée IO"],
])
  add("Alarmes", id, label, false);
for (const field of fields)
  if (vendorFieldIds.includes(field.id)) field.automatic = true;
export const defaultFields = fields;
export const defaultGroups = [...new Set(fields.map((f) => f.group))];
export type DefaultsProfile = {
  version: 1;
  revision: number;
  name: string;
  fields: Record<string, { included: boolean; value: DefaultValue }>;
};
export function initialDefaults(): DefaultsProfile {
  return {
    version: 1,
    revision: 0,
    name: "Sezaam",
    fields: Object.fromEntries(
      fields.map((f) => [f.id, { included: true, value: f.value }]),
    ),
  };
}
export function validateDefaults(input: unknown): DefaultsProfile {
  const p = input as DefaultsProfile;
  if (
    !p ||
    p.version !== 1 ||
    !Number.isSafeInteger(p.revision) ||
    p.revision < 0 ||
    typeof p.name !== "string" ||
    !p.name.trim() ||
    p.name.length > 100 ||
    !p.fields ||
    Object.keys(p.fields).length !== fields.length
  )
    throw Error("Profil de paramètres invalide.");
  for (const f of fields) {
    const v = p.fields[f.id];
    if (
      !v ||
      typeof v.included !== "boolean" ||
      typeof v.value !== typeof f.value ||
      (typeof v.value === "number" &&
        (!Number.isFinite(v.value) || v.value < 0 || v.value > 1000000)) ||
      (typeof v.value === "string" && v.value.length > 256) ||
      (f.options && !f.options.includes(String(v.value)))
    )
      throw Error(`Valeur invalide : ${f.label}.`);
  }
  if (Number(p.fields.qpMin.value) > Number(p.fields.qpMax.value))
    throw Error("Le QP minimum doit être inférieur ou égal au maximum.");
  if (Number(p.fields.lightBrightness.value) > 100)
    throw Error(
      "La luminosité de l’éclairage doit être comprise entre 0 et 100 %.",
    );
  return {
    version: 1,
    revision: p.revision,
    name: p.name.trim(),
    fields: Object.fromEntries(
      fields.map((f) => [
        f.id,
        { included: p.fields[f.id].included, value: p.fields[f.id].value },
      ]),
    ),
  };
}
export type DefaultRow = FieldTrace & {
  id: string;
  label: string;
  value: DefaultValue;
  before?: string;
  state:
    "ready" | "same" | "manual" | "blocked" | "verified" | "failed" | "skipped";
  message: string;
};
export type DefaultsCameraPlan = {
  camera: Camera;
  rows: DefaultRow[];
  error?: string;
};
export type DefaultsPlan = {
  id: string;
  name: string;
  revision: number;
  createdAt: string;
  cameras: DefaultsCameraPlan[];
};
export type DefaultsProgress = {
  camera: string;
  completed: number;
  total: number;
  stage: string;
};
export const defaultValueLabel = (v: DefaultValue) =>
  typeof v === "boolean"
    ? v
      ? "Activé"
      : "Désactivé"
    : String(v === "" ? "Non renseigné" : v);
