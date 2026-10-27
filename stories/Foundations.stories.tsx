import React from "react";
import {
  Camera,
  Activity,
  Network,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Search,
} from "lucide-react";
import { Brand } from "../src/renderer/design-system/Brand";
import prismBoard from "../assets/brand/generated/review-board.png";
import tokens from "../src/renderer/design-system/tokens.json";
export default {
  title: "Foundations",
  parameters: {
    docs: {
      description: {
        component:
          "Tokens Quasar partagés avec l’application. Palette unie, identité Prisme et accents magenta, états distingués par couleur, icône et texte. Polices locales sous SIL OFL.",
      },
    },
  },
};
export const Colors = {
  render: () => (
    <div className="story-row">
      {[
        "bg",
        "surface",
        "surface-raised",
        "text",
        "muted",
        "accent",
        "success",
        "warning",
        "danger",
        "info",
        "unsupported",
        "untested",
        "focus",
      ].map((k) => (
        <div className="story-swatch" key={k}>
          <i style={{ background: `var(--${k})` }} />
          <code>--{k}</code>
        </div>
      ))}
    </div>
  ),
};
export const Typography = {
  render: () => (
    <div className="story-stack">
      <h1>Concentrez vos idées.</h1>
      <h2>Des outils pour aller plus loin.</h2>
      <p>
        Inter — navigation, champs et textes courants. Un réglage clair, une
        caméra à la fois.
      </p>
      <code>192.0.2.101 · 02:00:00:00:00:01 · 25 FPS</code>
      <small>Informations secondaires lisibles — 12 px minimum.</small>
    </div>
  ),
};
export const Spacing = {
  render: () => (
    <div className="story-stack">
      {[4, 8, 12, 16, 24, 32, 48].map((n) => (
        <div key={n} className="story-row">
          <code>{n} px</code>
          <span style={{ width: n, height: 24, background: "var(--accent)" }} />
        </div>
      ))}
    </div>
  ),
};
export const Icons = {
  render: () => (
    <div className="story-row">
      {[
        Camera,
        Activity,
        Network,
        CheckCircle2,
        AlertTriangle,
        AlertCircle,
        Info,
        Search,
      ].map((Icon, i) => (
        <Icon
          key={i}
          aria-label={
            [
              "Caméra",
              "Diagnostic",
              "Réseau",
              "Succès",
              "Attention",
              "Erreur",
              "Information",
              "Recherche",
            ][i]
          }
          size={24}
        />
      ))}
    </div>
  ),
};
export const Themes = {
  render: () => (
    <div className="story-stack">
      <Brand />
      <h1>Quasar</h1>
      <p>
        La barre d’outils permet de passer du thème sombre au thème clair. Les
        mêmes composants utilisent deux jeux de tokens sémantiques.
      </p>
      <p>{Object.keys(tokens).join(" · ")}</p>
    </div>
  ),
};

export const Identity = {
  render: () => (
    <div className="story-stack">
      <h1>Quasar · Prisme</h1>
      <p>
        Ruban angulaire, queue détachée, magenta sur bleu nuit ou fond clair.
        Les variantes monochromes conservent la même géométrie.
      </p>
      <img
        src={prismBoard}
        alt="Logo Quasar Prisme sur fonds sombre et clair, symbole de 16 à 128 pixels et icône d’application"
        style={{ width: "100%", maxWidth: 1200, height: "auto" }}
      />
    </div>
  ),
};
