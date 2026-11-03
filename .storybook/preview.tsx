import React from "react";
import type { Preview } from "@storybook/react-vite";
import "../src/renderer/style.css";
import "./storybook.css";
import { installMock } from "../stories/fixtures";
import { setLanguage } from "../src/shared/i18n";
const preview: Preview = {
  tags: ["autodocs"],
  globalTypes: {
    language: {
      description: "Language / Langue",
      toolbar: {
        icon: "globe",
        items: [
          { value: "fr", title: "Français" },
          { value: "en", title: "English" },
        ],
        dynamicTitle: true,
      },
    },
    theme: {
      description: "Thème Quasar",
      toolbar: {
        icon: "circlehollow",
        items: [
          { value: "dark", title: "Sombre" },
          { value: "light", title: "Clair" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "dark", language: "fr" },
  parameters: {
    layout: "padded",
    a11y: { test: "error" },
    controls: { expanded: true },
  },
  beforeEach: () => {
    installMock();
  },
  decorators: [
    (Story, context) => {
      setLanguage(context.globals.language === "en" ? "en" : "fr");
      document.documentElement.lang =
        context.globals.language === "en" ? "en" : "fr";
      document.documentElement.dataset.theme = context.globals.theme;
      localStorage.setItem("sezaam-theme", context.globals.theme);
      return (
        <div
          className="story-surface"
          key={`${context.globals.theme}-${context.globals.language}`}
        >
          <Story />
        </div>
      );
    },
  ],
};
export default preview;
