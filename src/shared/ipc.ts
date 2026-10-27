import type { Api, CameraDetailUpdate, NetworkState } from "./types";
import type { AddressProgress } from "./addressing";
import type { DefaultsProgress } from "./defaults";
import type { FactoryResetPlan } from "./factory-reset";

// Keep the inherited channel names for installed clients and saved preferences.
export const channels = {
  call: "sezaam:call",
  network: "sezaam:network",
  invalidated: "sezaam:invalidated",
  detail: "sezaam:camera-detail",
  lighting: "sezaam:preview-lighting",
  defaults: "sezaam:defaults-progress",
  addressing: "sezaam:address-progress",
  reset: "sezaam:factory-reset-progress",
} as const;
export type Events = {
  network: NetworkState;
  invalidated: string;
  detail: CameraDetailUpdate;
  lighting: { id: string; url: string; warning?: string };
  defaults: DefaultsProgress;
  addressing: AddressProgress;
  reset: FactoryResetPlan;
};
export type Reply<T = unknown> =
  | { ok: true; value?: T }
  | {
      ok: false;
      error: string;
      code: "INVALID_REQUEST" | "BUSY" | "CANCELLED" | "FAILED";
    };

/** Snapshots remain readable during an exclusive operation; camera I/O does not. */
export const operationMode = {
  state: "snapshot",
  getDefaults: "snapshot",
  listDefaultsRuns: "snapshot",
  getDefaultsRun: "snapshot",
  copyLogs: "snapshot",
  exportLogs: "snapshot",
  exportDefaultsRun: "snapshot",
  stopVideo: "cancel",
  cancelCameraRead: "cancel",
  selectCamera: "read",
  readCamera: "read",
  previewProfiles: "read",
  startVideo: "read",
  openWeb: "read",
  discover: "exclusive",
  addCamera: "exclusive",
  connectSession: "exclusive",
  disconnectSession: "exclusive",
  retryConnections: "exclusive",
  changeIP: "exclusive",
  setVideo: "exclusive",
  setImage: "exclusive",
  setWebOSD: "exclusive",
  setOSD: "exclusive",
  createOSD: "exclusive",
  disableOSD: "exclusive",
  restoreOSD: "exclusive",
  diagnose: "exclusive",
  setCameraNetwork: "exclusive",
  syncCameraTime: "exclusive",
  saveDefaults: "exclusive",
  auditDefaults: "exclusive",
  previewDefaults: "exclusive",
  applyDefaults: "exclusive",
  previewAddresses: "exclusive",
  applyAddresses: "exclusive",
  resolveIPConflict: "exclusive",
  previewFactoryReset: "exclusive",
  applyFactoryReset: "exclusive",
} satisfies Record<keyof Api, "snapshot" | "cancel" | "read" | "exclusive">;
