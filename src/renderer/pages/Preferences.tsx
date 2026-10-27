import React from "react";
import { Panel, Field } from "../design-system/components";
import type { Preferences } from "../preferences";
export function PreferencesPage({
  preferences,
  setPreferences,
  theme,
  chooseTheme,
}: {
  preferences: Preferences;
  setPreferences: React.Dispatch<React.SetStateAction<Preferences>>;
  theme: string;
  chooseTheme: (theme: "light" | "dark") => void;
}) {
  return (
    <Panel className="preferences-page panel">
      <h2>Paramètres de l’application</h2>
      <h3>Lecture vidéo</h3>
      <label className="preference-row">
        <span>
          <strong>Lecture automatique</strong>
          <small>Lancer l’aperçu à l’ouverture d’une caméra.</small>
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
          <strong>Privilégier le direct</strong>
          <small>Rattraper automatiquement le retard du lecteur.</small>
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
      <Field label="Flux d’aperçu par défaut">
        <select
          value={preferences.previewQuality}
          onChange={(e) =>
            setPreferences((p) => ({
              ...p,
              previewQuality: e.target.value as "light" | "main",
            }))
          }
        >
          <option value="light">Fluide — flux le plus léger</option>
          <option value="main">Détaillé — flux principal</option>
        </select>
      </Field>
      <p className="help-text">
        Ce choix s’applique à la prochaine ouverture d’une caméra. Il ne modifie
        pas son encodage.
      </p>
      <h3>Apparence</h3>
      <Field label="Thème">
        <select
          value={theme}
          onChange={(e) => chooseTheme(e.target.value as "light" | "dark")}
        >
          <option value="light">Clair</option>
          <option value="dark">Sombre</option>
        </select>
      </Field>
    </Panel>
  );
}
