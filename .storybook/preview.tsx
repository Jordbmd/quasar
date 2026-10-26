import React from "react";
import type { Preview } from "@storybook/react-vite";
import "../src/renderer/style.css";
import "./storybook.css";
import { installMock } from "../stories/fixtures";
const preview: Preview = {
  tags: ["autodocs"],
  globalTypes: {
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
  initialGlobals: { theme: "dark" },
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
      document.documentElement.dataset.theme = context.globals.theme;
      localStorage.setItem("sezaam-theme", context.globals.theme);
      return (
        <div className="story-surface" key={context.globals.theme}>
          <Story />
        </div>
      );
    },
  ],
};
export default preview;
