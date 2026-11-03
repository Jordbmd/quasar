import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./main";
import { setLanguage } from "../shared/i18n";
// Main owns the persisted preference, so native dialogs and React agree on restart.
void window.sezaam
  .call("getLanguage", undefined)
  .then((language) => {
    setLanguage(language);
    document.documentElement.lang = language;
    createRoot(document.getElementById("root")!).render(<App />);
  })
  .catch(() => {
    document.getElementById("root")!.textContent =
      "Impossible de charger les préférences locales. Relancez Quasar. / Cannot load local preferences. Restart Quasar.";
  });
