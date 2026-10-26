import React from "react";
import {
  CameraCard as Card,
  CameraFacts,
  VideoPlaceholder,
  DiagnosticResults,
  EventLog,
} from "../src/renderer/design-system/camera";
import { Settings } from "../src/renderer/Settings";
import { camera, detail, state, report } from "./fixtures";
export default {
  title: "Camera",
  parameters: {
    docs: {
      description: {
        component:
          "SIMULATION — adresses réservées à la documentation, aucun accès au matériel. Les formulaires sont ceux de l’application ; les écritures sont bloquées par le mock.",
      },
    },
  },
};
export const CameraCard = {
  args: { selected: false, disabled: false },
  render: (args: any) => (
    <div style={{ maxWidth: 340 }}>
      <Card camera={camera} onSelect={() => {}} {...args} />
    </div>
  ),
};
export const CameraList = {
  render: () => (
    <div style={{ maxWidth: 340 }}>
      {state.cameras.map((c, i) => (
        <Card key={c.id} camera={c} selected={i === 0} onSelect={() => {}} />
      ))}
    </div>
  ),
};
export const CameraDetails = { render: () => <CameraFacts camera={camera} /> };
export const EmptyDetails = { render: () => <CameraFacts /> };
export const VideoPreview = {
  args: { selected: true, connected: true },
  render: (args: any) => (
    <div className="preview">
      <VideoPlaceholder {...args} />
    </div>
  ),
};
export const NetworkVideoOSDSettings = {
  render: () => (
    <div className="story-frame">
      <Settings
        detail={detail}
        busy={false}
        onDirty={() => {}}
        run={async (_, work) => {
          try {
            return await work();
          } catch {
            return undefined;
          }
        }}
        onRefresh={async () => detail}
        onStop={async () => {}}
      />
    </div>
  ),
};
export const UnavailableSettings = {
  render: () => (
    <Settings
      busy={false}
      onDirty={() => {}}
      run={async () => undefined}
      onRefresh={async () => detail}
      onStop={async () => {}}
    />
  ),
};
