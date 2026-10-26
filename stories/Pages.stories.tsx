import React from "react";
import { within, userEvent, expect } from "storybook/test";
import { App } from "../src/renderer/main";
export default {
  title: "Pages",
  parameters: { layout: "fullscreen" },
  render: () => (
    <div className="story-app-preview">
      <div className="story-simulation">SIMULATION — aucune caméra réelle</div>
      <App />
    </div>
  ),
};
export const Cameras = {};
export const SessionLogin = {
  play: async ({ canvasElement }: any) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", {
        name: "Se connecter",
        exact: true,
      }),
    );
    await expect(
      await within(document.body).findByRole("dialog", {
        name: "Connexion à l’application",
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
      c.getByRole("button", { name: "Se connecter", exact: true }),
    );
    await userEvent.click(
      within(document.body).getByRole("button", {
        name: "Connecter les caméras",
        exact: true,
      }),
    );
    await expect(
      await c.findByLabelText("FPS (images/s)", { exact: true }),
    ).toHaveValue(25);
  },
};
export const Diagnostic = {
  play: async ({ canvasElement }: any) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: /Diagnostic Tests/ }),
    );
  },
};
export const DiagnosticResults = {
  play: async ({ canvasElement }: any) => {
    const c = within(canvasElement);
    await userEvent.click(
      await c.findByRole("button", { name: /Caméra Atelier — SIMULATION/ }),
    );
    await userEvent.click(c.getByRole("button", { name: /Diagnostic Tests/ }));
  },
};
export const AddCameraModal = {
  play: async ({ canvasElement }: any) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Ajouter par IP",
        exact: true,
      }),
    );
  },
};
