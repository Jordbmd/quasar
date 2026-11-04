import React, { useState } from "react";
import { within, userEvent, expect } from "storybook/test";
import { BoxLibrary } from "../src/renderer/BoxLibrary";
import { BoxView } from "../src/renderer/BoxView";
import { AutoLoginSettings } from "../src/renderer/AutoLoginSettings";
import type { BoxDefinition, BoxBindings } from "../src/shared/box";
import { cameraKey } from "../src/shared/box";
import type { AutoLoginStatus } from "../src/shared/auto-login";
import { camera } from "./fixtures";
import { t } from "../src/shared/i18n";
import "../src/renderer/box.css";

export default { title: "Box workflows", parameters: { layout: "padded" } };
const box: BoxDefinition = {
  name: "Box — SIMULATION",
  metadata: { id: "TEST-BOX", address: "Site fictif" },
  lockers: [
    { number: 0, kind: "IHM", column: 0, zone: 0, ports: "", ip: "0.0.0.0" },
    {
      number: 1,
      kind: "S",
      column: 1,
      zone: 1,
      ports: "1:1",
      ip: "192.168.1.11",
    },
    {
      number: 2,
      kind: "M",
      column: 1,
      zone: 1,
      ports: "1:2",
      ip: "192.168.1.12",
    },
  ],
};
const entry = { id: "synthetic-box", box, bindings: {} };
export const Library = {
  render: () => (
    <BoxLibrary
      library={{ version: 1, entries: [entry] }}
      busy={false}
      onOpen={() => {}}
      onSave={async () => true}
    />
  ),
};
export const EmptyLibrary = {
  render: () => (
    <BoxLibrary
      library={{ version: 1, entries: [] }}
      busy={false}
      onOpen={() => {}}
      onSave={async () => true}
    />
  ),
};
export const Editor = {
  ...EmptyLibrary,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: t("Créer une Box"),
        exact: true,
      }),
    );
    await expect(within(document.body).getByRole("dialog")).toBeVisible();
  },
};
function Workflow({
  busy = false,
  conflict = false,
}: {
  busy?: boolean;
  conflict?: boolean;
}) {
  const cam = { ...camera, ambiguous: conflict };
  const [bindings, setBindings] = useState<BoxBindings>({
    "1": cameraKey(cam),
  });
  return (
    <BoxView
      box={box}
      bindings={bindings}
      cameras={[cam]}
      busy={busy}
      ready={true}
      issues={{}}
      onImport={async () => true}
      onBind={(n, key) => setBindings((b) => ({ ...b, [n]: key }))}
      onCamera={async () => true}
      onDetect={() => {}}
      onAddress={() => {}}
      onProfile={() => {}}
      onResolveConflicts={() => {}}
    />
  );
}
export const Associations = { render: () => <Workflow /> };
export const OperationInProgress = { render: () => <Workflow busy /> };
export const ConflictingCamera = { render: () => <Workflow conflict /> };
function Login({
  initial,
  busy = false,
}: {
  initial?: AutoLoginStatus;
  busy?: boolean;
}) {
  const [status, setStatus] = useState(initial);
  return (
    <AutoLoginSettings
      status={status}
      busy={busy}
      onSave={async (value) => {
        setStatus({
          available: true,
          enabled: value.enabled,
          ...(value.enabled ? { username: value.username } : {}),
        });
        return true;
      }}
    />
  );
}
export const LoginLoading = { render: () => <Login /> };
export const LoginDisabled = {
  render: () => <Login initial={{ available: true, enabled: false }} />,
};
export const LoginSaved = {
  render: () => (
    <Login
      initial={{ available: true, enabled: true, username: "synthetic-user" }}
    />
  ),
};
export const LoginUnavailable = {
  render: () => <Login initial={{ available: false, enabled: false }} />,
};
export const LoginSaving = {
  render: () => (
    <Login
      busy
      initial={{ available: true, enabled: true, username: "synthetic-user" }}
    />
  ),
};
