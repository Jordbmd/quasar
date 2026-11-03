import { t } from "../src/shared/i18n";
import React from "react";
import { within, userEvent, expect } from "storybook/test";
import { App } from "../src/renderer/main";
export default {
  title: "Pages",
  parameters: { layout: "fullscreen" },
  render: () => (
    <div className="story-app-preview">
      <div className="story-simulation" role="region" aria-label="Simulation">
        {t("SIMULATION — aucune caméra réelle")}
      </div>
      <App />
    </div>
  ),
};
export const Cameras = {};
export const SessionLogin = {
  play: async ({ canvasElement }: any) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", {
        name: `${t("Se connecter")} ${t("Connexion aux caméras")}`,
        exact: true,
      }),
    );
    await expect(
      await within(document.body).findByRole("dialog", {
        name: t("Connexion à l’application"),
      }),
    ).toBeVisible();
  },
};
export const SelectedCamera = {
  play: async ({ canvasElement }: any) => {
    const c = within(canvasElement);
    await userEvent.click(
      await c.findByRole("button", { name: /Caméra Atelier — SIMULATION/ }),
    );
    await userEvent.click(
      c.getByRole("button", {
        name: `${t("Se connecter")} ${t("Connexion aux caméras")}`,
        exact: true,
      }),
    );
    await userEvent.click(
      within(document.body).getByRole("button", {
        name: t("Connecter les caméras"),
        exact: true,
      }),
    );
    await expect(
      await c.findByLabelText(t("FPS (images/s)"), { exact: true }),
    ).toHaveValue(25);
  },
};
export const Diagnostic = {
  play: async ({ canvasElement }: any) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: t("Diagnostic Tests et résolution de problèmes"),
      }),
    );
  },
};
export const DiagnosticResults = {
  play: async ({ canvasElement }: any) => {
    const c = within(canvasElement);
    await userEvent.click(
      await c.findByRole("button", { name: /Caméra Atelier — SIMULATION/ }),
    );
    await userEvent.click(
      c.getByRole("button", {
        name: t("Diagnostic Tests et résolution de problèmes"),
      }),
    );
  },
};
export const AddCameraModal = {
  play: async ({ canvasElement }: any) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: t("Ajouter par IP"),
        exact: true,
      }),
    );
  },
};
