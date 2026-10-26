import React, { useState } from "react";
import { Search } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";
import {
  Button,
  Field,
  Panel,
  Badge,
  Alert,
  Loading,
  Skeleton,
  EmptyState,
  Modal,
} from "../src/renderer/design-system/components";
export default {
  title: "Components",
  parameters: {
    docs: {
      description: {
        component:
          "Primitives réellement utilisées dans Quasar. Les contrôles natifs conservent leurs interactions clavier. Les modales utilisent dialog, piègent le focus et restaurent le déclencheur.",
      },
    },
  },
};
export const Buttons = {
  args: { loading: false, disabled: false },
  render: (args: any) => (
    <div className="story-row">
      {(["primary", "secondary", "tertiary", "destructive"] as const).map(
        (v) => (
          <Button key={v} variant={v} {...args}>
            {v === "primary"
              ? "Appliquer"
              : v === "secondary"
                ? "Annuler"
                : v === "tertiary"
                  ? "En savoir plus"
                  : "Abandonner"}
          </Button>
        ),
      )}
      <Button aria-label="Rechercher" {...args}>
        <Search size={18} />
      </Button>
    </div>
  ),
};
export const LoadingButton = {
  render: () => (
    <Button variant="primary" loading>
      Enregistrement
    </Button>
  ),
};
export const Disabled = {
  render: () => (
    <div className="story-row">
      <Button disabled>Indisponible</Button>
      <Field label="Adresse IP">
        <input disabled value="192.0.2.101" readOnly />
      </Field>
    </div>
  ),
};
function InputsExample() {
  const [text, setText] = useState("192.0.2.101");
  return (
    <div className="story-stack">
      <Field
        label="Adresse IP"
        hint="Adresse de la caméra sur la connexion Ethernet."
      >
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Field
        label="Adresse invalide"
        error="Saisissez une adresse IPv4 valide."
      >
        <input defaultValue="999.0.0.1" />
      </Field>
      <Field label="FPS">
        <input type="number" min={1} max={30} defaultValue={25} />
      </Field>
      <Field label="Codec">
        <select defaultValue="H264">
          <option>H264</option>
          <option>H265</option>
        </select>
      </Field>
      <Field label="Numéro de série">
        <input readOnly value="DEMO-001" />
      </Field>
      <label className="check">
        <input type="checkbox" /> Afficher le nom
      </label>
      <fieldset>
        <legend>Mode IP</legend>
        <label>
          <input type="radio" name="mode" defaultChecked /> Statique
        </label>
        <label>
          <input type="radio" name="mode" /> DHCP
        </label>
      </fieldset>
    </div>
  );
}
export const Inputs = {
  render: () => <InputsExample />,
  play: async ({ canvasElement }: any) => {
    const c = within(canvasElement),
      ip = c.getByRole("textbox", { name: "Adresse IP", exact: true });
    await userEvent.clear(ip);
    await userEvent.type(ip, "192.0.2.102");
    await expect(ip).toHaveValue("192.0.2.102");
  },
};
export const Cards = {
  render: () => (
    <Panel>
      <h2>Informations de la caméra</h2>
      <p>Une surface, une bordure et des espacements communs.</p>
    </Panel>
  ),
};
export const Badges = {
  render: () => (
    <div className="story-row">
      {[
        ["success", "Connectée"],
        ["warning", "À vérifier"],
        ["danger", "Erreur"],
        ["info", "Information"],
        ["unsupported", "Non pris en charge"],
        ["untested", "Non testé"],
      ].map(([k, t]) => (
        <Badge key={k} kind={k}>
          {t}
        </Badge>
      ))}
    </div>
  ),
};
function ModalExample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Ouvrir la confirmation</Button>
      <Modal
        open={open}
        title="Modifications non enregistrées"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>
              Continuer la modification
            </Button>
            <Button variant="destructive" onClick={() => setOpen(false)}>
              Abandonner
            </Button>
          </>
        }
      >
        Les modifications de la caméra n’ont pas encore été appliquées.
      </Modal>
    </>
  );
}
export const Modals = { render: () => <ModalExample /> };
export const Feedback = {
  render: () => (
    <div className="story-stack">
      <Alert kind="success">Réglages confirmés par relecture.</Alert>
      <Alert kind="warning">
        Certains réglages ne sont pas pris en charge.
      </Alert>
      <Alert kind="danger">
        Connexion impossible. Vérifiez le câble et l’adresse IP.
      </Alert>
      <Alert kind="info">Connectez une caméra pour lire ses paramètres.</Alert>
    </div>
  ),
};
export const LoadingState = {
  render: () => (
    <div className="story-stack">
      <Loading label="Lecture de la caméra" />
      <Skeleton />
    </div>
  ),
};
export const Empty = {
  render: () => (
    <EmptyState title="Aucune caméra détectée">
      Branchez le hub Ethernet puis lancez la détection.
    </EmptyState>
  ),
};
