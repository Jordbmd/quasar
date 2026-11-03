import { t } from "../../shared/i18n";
import React from "react";
import { Panel, Field } from "../design-system/components";
import type { Preferences } from "../preferences";
export function PreferencesPage({
  preferences,
  setPreferences,
  theme,
  chooseTheme,
  language,
  chooseLanguage,
}: {
  preferences: Preferences;
  setPreferences: React.Dispatch<React.SetStateAction<Preferences>>;
  theme: string;
  chooseTheme: (theme: "light" | "dark" | "system") => void;
  language: "fr" | "en";
  chooseLanguage: (language: "fr" | "en") => void;
}) {
  return (
    <Panel className="preferences-page panel">
      <Field label={t("Langue")}>
        <select
          aria-label={t("Langue")}
          value={language}
          onChange={(event) =>
            chooseLanguage(event.target.value as "fr" | "en")
          }
        >
          <option value="fr" lang="fr">
            Français
          </option>
          <option value="en" lang="en">
            English
          </option>
        </select>
      </Field>
      <h2>{t("Paramètres de l’application")}</h2>
      <h3>{t("Lecture vidéo")}</h3>
      <label className="preference-row">
        <span>
          <strong>{t("Lecture automatique")}</strong>
          <small>{t("Lancer l’aperçu à l’ouverture d’une caméra.")}</small>
        </span>
        <input
          type="checkbox"
          checked={preferences.autoplay}
          onChange={(e) =>
            setPreferences((p) => ({ ...p, autoplay: e.target.checked }))
          }
        />
      </label>
      <label className="preference-row">
        <span>
          <strong>{t("Privilégier le direct")}</strong>
          <small>{t("Rattraper automatiquement le retard du lecteur.")}</small>
        </span>
        <input
          type="checkbox"
          checked={preferences.lowLatency}
          onChange={(e) =>
            setPreferences((p) => ({
              ...p,
              lowLatency: e.target.checked,
            }))
          }
        />
      </label>
      <p className="help-text">
        {t(
          "Le flux principal (MainStream) est sélectionné à l’ouverture de chaque caméra. Vous pouvez choisir un autre flux dans le lecteur. Si aucun flux principal n’est identifié, le profil de plus haute résolution disponible est utilisé. Ce choix ne modifie pas l’encodage de la caméra.",
        )}
      </p>
      <h3>{t("Apparence")}</h3>
      <Field label={t("Thème")}>
        <select
          aria-label={t("Thème")}
          value={theme}
          onChange={(e) =>
            chooseTheme(e.target.value as "light" | "dark" | "system")
          }
        >
          <option value="system">{t("Système")}</option>
          <option value="light">{t("Clair")}</option>
          <option value="dark">{t("Sombre")}</option>
        </select>
      </Field>
    </Panel>
  );
}
