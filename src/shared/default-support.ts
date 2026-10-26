import { defaultFields } from "./defaults";
import type { CameraDetail } from "./types";
import { vendorFieldIds, vendorGroups, vendorMappings } from "./vendor-profile";
export type SupportKind =
  "implemented" | "standard" | "mapping" | "vendor" | "manual";
export type SupportAssessment = {
  kind: SupportKind;
  method: string;
  reason: string;
  source?: string;
  optionPaths?: string[];
};
export const supportLabels: Record<SupportKind, string> = {
  implemented: "Écriture intégrée",
  standard: "Standard à intégrer",
  mapping: "Correspondance à valider",
  vendor: "API constructeur requise",
  manual: "Étape séparée",
};
const imaging =
  "https://www.onvif.org/specs/srv/img/ONVIF-Imaging-Service-Spec.pdf";
const media =
  "https://www.onvif.org/specs/srv/media/ONVIF-Media-Service-Spec.pdf";
const media2 =
  "https://www.onvif.org/specs/srv/media/ONVIF-Media2-Service-Spec.pdf";
const analytics =
  "https://www.onvif.org/specs/srv/analytics/ONVIF-Analytics-Service-Spec.pdf";
const support: Record<string, SupportAssessment> = {};
function group(
  ids: string[],
  kind: SupportKind,
  method: string,
  reason: string,
  source?: string,
  optionPaths?: string[],
) {
  for (const id of ids)
    support[id] = { kind, method, reason, source, optionPaths };
}
group(
  ["brightness", "colorSaturation", "sharpness", "contrast"],
  "implemented",
  "GetOptions → SetImagingSettings → GetImagingSettings",
  "Plage annoncée obligatoire ; aucune conversion implicite des valeurs.",
  imaging,
);
group(
  [
    "codec",
    "resolution",
    "bitrateControl",
    "govLength",
    "bitrate",
    "fps",
    "h264Profile",
  ],
  "implemented",
  "GetVideoEncoderConfigurationOptions → SetVideoEncoderConfiguration → GetVideoEncoderConfiguration",
  "Options de l’encodeur et identification du flux contrôlées avant écriture.",
  media2,
);
group(
  ["osd"],
  "implemented",
  "GetOSDs / DeleteOSD / CreateOSD",
  "Sauvegarde avant suppression ; relecture des objets. Activation par restauration.",
  media,
);
group(
  ["syncTime", "clockTimezone"],
  "implemented",
  "SetSystemDateAndTime → GetSystemDateAndTime",
  "Date UTC, fuseau et mode relus après envoi. Compatible si le service répond.",
  "https://www.onvif.org/yaml/wsdl-viewer2.php",
);
group(
  ["backlight"],
  "mapping",
  "BacklightCompensation.Level / Mode",
  "Niveau BLC possible ; mode actif et échelle du champ à confirmer.",
  imaging,
  ["backlightCompensation"],
);
group(
  ["awbMode"],
  "standard",
  "WhiteBalance.Mode",
  "Modes AUTO/MANUAL prévus par ONVIF ; adaptateur d’écriture à intégrer.",
  imaging,
  ["whiteBalance"],
);
group(
  ["awbRed"],
  "mapping",
  "WhiteBalance.CrGain",
  "Gain rouge standard ; correspondance numérique du gain enregistré à valider.",
  imaging,
  ["whiteBalance"],
);
group(
  ["awbBlue"],
  "mapping",
  "WhiteBalance.CbGain",
  "Gain bleu standard ; correspondance numérique du gain enregistré à valider.",
  imaging,
  ["whiteBalance"],
);
group(
  ["awbGreen"],
  "vendor",
  "Aucun gain vert indépendant identifié",
  "Le réglage RGB constructeur ne se transpose pas intégralement en balance des blancs ONVIF.",
  imaging,
);
group(
  ["defog"],
  "standard",
  "Defogging.Mode",
  "Extension Imaging standard optionnelle ; prise en charge à lire avant intégration.",
  imaging,
  ["extension.extension.extension.defoggingOptions"],
);
group(
  ["defogRange"],
  "mapping",
  "Defogging.Level",
  "Niveau optionnel ; plage constructeur à rapprocher de celle annoncée.",
  imaging,
  ["extension.extension.extension.defoggingOptions"],
);
group(
  ["wdrRange"],
  "mapping",
  "WideDynamicRange.Level",
  "Niveau WDR standard, conditionné par le mode WDR et la plage disponible.",
  imaging,
  ["wideDynamicRange"],
);
group(
  ["denoise2d", "denoise3d"],
  "mapping",
  "NoiseReduction.Level",
  "Un niveau standard ne permet pas de déduire deux commandes 2D et 3D distinctes.",
  imaging,
  ["extension.extension.extension.noiseReductionOptions"],
);
group(
  ["dayShutterMode", "dayShutterSpeed"],
  "mapping",
  "Exposure.Mode / ExposureTime",
  "Exposition standard en microsecondes ; profils jour/nuit séparés et unité « 10 » non établis.",
  imaging,
  ["exposure"],
);
group(
  ["videoMode"],
  "mapping",
  "Exposure.Priority",
  "Priorité FrameRate possible en exposition automatique ; pas une équivalence validée au mode vidéo enregistré.",
  imaging,
  ["exposure"],
);
group(
  ["ircutMode"],
  "implemented",
  "Mode manuel → DayMode → GetImagingSettings",
  "Mode manuel et filtre infrarouge relus après la commande Jour.",
  imaging,
  ["irCutFilterModes"],
);
group(
  ["videoFormat", "antiFlicker"],
  "vendor",
  "API de fréquence / anti-scintillement",
  "Aucune commande générique équivalente établie pour ces deux champs.",
);
group(
  ["horizonFlip", "verticalFlip"],
  "mapping",
  "VideoSourceConfiguration.Rotate",
  "Rotation disponible sur certains services média ; deux miroirs indépendants ne se déduisent pas d’une rotation.",
  media2,
);
group(
  ["hlc", "overexposure"],
  "vendor",
  "API de traitement d’image",
  "Aucune correspondance exacte validée pour ces paramètres.",
);
group(
  ["allSubnetOnvif"],
  "vendor",
  "API réseau constructeur",
  "Ce libellé ne définit pas une commande ONVIF standard ; ne pas désactiver ONVIF par assimilation.",
);
group(
  [
    "lightThreshold1",
    "lightThreshold2",
    "lightMode",
    "lightImage",
    "lightBrightnessMode",
    "lightBrightness",
  ],
  "vendor",
  "API d’éclairage constructeur",
  "LED blanches, seuils et luminosité nécessitent une commande documentée et une relecture.",
);
group(
  ["mainStream", "subStream"],
  "mapping",
  "Profils média / configurations",
  "Retirer un encodeur d’un profil n’est pas une désactivation globale du flux constructeur.",
  media,
);
group(
  ["audioEncode"],
  "mapping",
  "RemoveAudioEncoderConfiguration",
  "Retrait de l’audio d’un profil possible ; l’arrêt global de l’encodage reste à vérifier.",
  media,
);
group(
  ["audioAmplify"],
  "vendor",
  "API audio constructeur",
  "Amplification d’entrée non assimilée au volume d’une sortie audio.",
);
group(
  ["customQP", "qpMin", "qpMax"],
  "vendor",
  "API encodeur constructeur",
  "Les bornes QP ne sont pas équivalentes au paramètre Quality ONVIF.",
  media2,
);
group(
  ["privacyMask"],
  "standard",
  "GetMasks / GetMaskOptions / DeleteMask",
  "Media2 prévoit les masques ; vérifier la capacité Mask et sauvegarder avant une intégration.",
  media2,
);
group(
  ["localStorage"],
  "mapping",
  "GetRecordingJobs / SetRecordingJobMode",
  "Arrêter un job ne prouve pas la désactivation du stockage local constructeur.",
  "https://www.onvif.org/specs/2212/ONVIF-RecordingControl-Service-Spec-v2212.pdf",
);
group(
  ["motionAlarm"],
  "mapping",
  "GetSupportedRules / GetRules / ModifyRules",
  "Commandes web de détecteurs repérées ; leur couverture complète et leur disponibilité restent à confirmer avant de déclarer toute la détection IA désactivée.",
  analytics,
);
group(
  ["inputAlarm"],
  "vendor",
  "API d’alarme constructeur",
  "Recevoir un événement ONVIF ne prouve pas qu’on peut désactiver la génération de cette alarme.",
  analytics,
);
export function fieldSupport(id: string): SupportAssessment {
  if (vendorFieldIds.includes(id)) {
    const group =
      vendorMappings[id]?.group ?? (id === "privacyMask" ? "mask" : "input");
    return {
      ...support[id],
      kind: "implemented",
      method: `API web : ${vendorGroups[group].read} → ${vendorGroups[group].write} → relecture`,
      reason:
        "Adaptateur détecté par la structure des réponses, sans référence de caméra. Champ présent, valeur valide et sauvegarde obligatoires. Repli ONVIF pour les champs standard.",
    };
  }
  const result = support[id];
  if (!result) throw Error("Audit absent pour " + id);
  return result;
}
export type FieldAudit = SupportAssessment & {
  id: string;
  label: string;
  group: string;
  observation: string;
};
export function auditFields(detail?: CameraDetail): FieldAudit[] {
  return defaultFields.map((f) => {
    const s = fieldSupport(f.id);
    let observation = "Non testé sur cette caméra.";
    if (
      detail?.vendor?.state === "available" &&
      vendorFieldIds.includes(f.id)
    ) {
      const group =
        vendorMappings[f.id]?.group ??
        (f.id === "privacyMask" ? "mask" : "input");
      const feature = detail.vendor.data.groups[group];
      observation =
        feature?.state === "available"
          ? "Bloc constructeur lu. Voir le résultat du champ pour sa disponibilité et sa valeur ; écriture vérifiée seulement après application."
          : feature?.message || "Lecture du bloc constructeur impossible.";
    } else if (detail && s.optionPaths) {
      if (detail.image.state !== "available")
        observation =
          "Lecture des options d’image indisponible ; absence de support non démontrée.";
      else {
        const options = detail.image.data?.options;
        const found = s.optionPaths.some(
          (path) =>
            path.split(".").reduce((o, key) => o?.[key], options) != null,
        );
        observation = found
          ? "Option annoncée en lecture ; écriture non validée."
          : "Option non annoncée dans les options Imaging lues ; API constructeur éventuelle non testée.";
      }
    } else if (detail && s.kind !== "implemented")
      observation =
        "Aucun essai d’écriture. " +
        (s.kind === "vendor"
          ? "API constructeur non identifiée."
          : "Service spécifique / correspondance à vérifier.");
    return { ...s, id: f.id, label: f.label, group: f.group, observation };
  });
}
