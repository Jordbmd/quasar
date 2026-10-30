import type { WebOSD } from "./web-osd";
import type { AddressPlan, AddressProgress } from "./addressing";
import type { FactoryResetPlan } from "./factory-reset";
import type {
  ProfileRun,
  ProfileRunSummary,
  OperationIssue,
  FieldVerification,
} from "./profile-journal";
import type {
  DefaultsProfile,
  DefaultsPlan,
  DefaultsProgress,
} from "./defaults";
import type { OSDValues } from "./osd-options";
export type Adapter = {
  id: string;
  service: string;
  label: string;
  mac: string;
  kind: "ethernet" | "other";
  enabled: boolean;
  link: boolean;
  mode: "manual" | "dhcp" | "dhcp-manual" | "off" | "unknown";
  address: string;
  mask: string;
  router: string;
  dns: string[];
  clientId: string;
  raw: string;
  mtu?: number;
  media?: string;
  issue?: string;
};
export type NetworkState = {
  adapter?: Adapter;
  ready: boolean;
  reason: string;
  warning?: string;
  overlaps: string[];
};
export type Feature = {
  state: "available" | "unsupported" | "unverified" | "error" | "loading";
  data?: any;
  message?: string;
};
export type Camera = {
  id: string;
  ip: string;
  port: number;
  path: string;
  endpoint?: string;
  name?: string;
  model?: string;
  manufacturer?: string;
  firmware?: string;
  serial?: string;
  mac?: string;
  status: string;
  ambiguous: boolean;
  connectionError?: string;
};
export type CameraDetail = {
  readState?: "cached" | "partial" | "live";
  readAt?: string;
  camera: Camera;
  network: Feature;
  gateway: Feature;
  dns: Feature;
  video: Feature;
  image: Feature;
  osd: Feature;
  capabilities: Feature;
  profiles: any[];
  osdRestoreAvailable?: boolean;
  lighting: Feature;
  daylight?: Feature;
  clock?: Feature;
  vendor?: Feature;
  loading?: boolean;
};
export type CameraDetailUpdate = { requestId: string; detail: CameraDetail };
export type WriteResult = {
  issues?: OperationIssue[];
  fields?: Record<string, FieldVerification>;
  sent: boolean;
  acknowledged: boolean;
  verified: boolean;
  message: string;
  camera?: Camera;
  results?: { parameter: string; verified: boolean; message: string }[];
};
export type LogEntry = {
  at: string;
  level: string;
  event: string;
  detail: string;
  camera?: string;
};
export type AppState = {
  platform: string;
  arch: string;
  network: NetworkState;
  cameras: Camera[];
  logs: LogEntry[];
  videoReady: boolean;
  reports: DiagnosticReport[];
  session: CameraSession;
};
export type CameraSession = {
  active: boolean;
  username?: string;
  connected: number;
  total: number;
  failures: { id: string; ip: string; message: string }[];
};
export type Api = {
  previewFactoryReset: { input: { ids: string[] }; output: FactoryResetPlan };
  applyFactoryReset: {
    input: { planId: string; confirmation: string };
    output: FactoryResetPlan;
  };
  previewAddresses: { input: { start: number }; output: AddressPlan };
  applyAddresses: { input: { planId: string }; output: AddressPlan };
  resolveIPConflict: { input: { id: string; isolated: true }; output: Camera };
  syncCameraTime: {
    input: { id: string; timezone: "Europe/Paris" | "UTC" };
    output: WriteResult;
  };
  auditDefaults: { input: { ids: string[] }; output: ProfileRun };
  listDefaultsRuns: { input: undefined; output: ProfileRunSummary[] };
  getDefaultsRun: { input: { id: string }; output: ProfileRun };
  exportDefaultsRun: { input: { id: string }; output: string };
  getDefaults: { input: undefined; output: DefaultsProfile };
  saveDefaults: { input: DefaultsProfile; output: DefaultsProfile };
  previewDefaults: { input: { ids: string[] }; output: DefaultsPlan };
  applyDefaults: { input: { planId: string }; output: ProfileRun };
  state: { input: undefined; output: AppState };
  discover: { input: undefined; output: Camera[] };
  addCamera: { input: { ip: string; port: number }; output: Camera };
  connectSession: {
    input: { username: string; password: string };
    output: CameraSession;
  };
  disconnectSession: { input: undefined; output: void };
  retryConnections: { input: undefined; output: CameraSession };
  selectCamera: {
    input: { id: string; requestId?: string };
    output: CameraDetail;
  };
  readCamera: {
    input: { id: string; requestId?: string; scope?: "network" };
    output: CameraDetail;
  };
  cancelCameraRead: { input: undefined; output: void };
  changeIP: {
    input: {
      id: string;
      address: string;
      mask: string;
      isolated: boolean;
    };
    output: WriteResult;
  };
  setVideo: {
    input: {
      id: string;
      token: string;
      width: number;
      height: number;
      fps: number;
      codec?: string;
      constantBitrate?: boolean;
      govLength?: number;
      h264Profile?: string;
      quality?: number;
      bitrate?: number;
    };
    output: WriteResult;
  };
  setImage: {
    input: { id: string; values: Record<string, number | string> };
    output: WriteResult;
  };
  setWebOSD: { input: { id: string; values: WebOSD }; output: WriteResult };
  setOSD: {
    input: { id: string; token: string } & OSDValues;
    output: WriteResult;
  };
  createOSD: {
    input: { id: string; source: string } & OSDValues;
    output: WriteResult;
  };
  disableOSD: { input: { id: string; tokens?: string[] }; output: WriteResult };
  restoreOSD: { input: { id: string }; output: WriteResult };
  diagnose: { input: { id: string }; output: DiagnosticReport };
  setCameraNetwork: {
    input: {
      id: string;
      dhcp?: boolean;
      address?: string;
      mask?: string;
      gateway?: string;
      dns?: string[];
      isolated: boolean;
    };
    output: WriteResult;
  };
  previewProfiles: { input: { id: string }; output: any[] };
  startVideo: {
    input: { id: string; profile: string };
    output: { url: string };
  };
  stopVideo: { input: undefined; output: void };
  openWeb: { input: { id: string }; output: void };
  copyLogs: { input: undefined; output: void };
  exportLogs: { input: undefined; output: string };
};
export type DiagnosticReport = {
  cameraId: string;
  ip: string;
  at: string;
  checks: {
    key: string;
    label: string;
    state: "passed" | "failed" | "unsupported" | "untested";
    detail: string;
  }[];
};
export type Call = <K extends keyof Api>(
  method: K,
  input: Api[K]["input"],
) => Promise<Api[K]["output"]>;
declare global {
  interface Window {
    sezaam: {
      call: Call;
      onNetworkChanged: (fn: (network: NetworkState) => void) => () => void;
      onInvalidated: (fn: (reason: string) => void) => () => void;
      onAddressProgress?: (fn: (update: AddressProgress) => void) => () => void;
      onDefaultsProgress?: (
        fn: (update: DefaultsProgress) => void,
      ) => () => void;
      onFactoryResetProgress?: (
        fn: (update: FactoryResetPlan) => void,
      ) => () => void;
      onPreviewLighting: (
        fn: (update: { id: string; url: string; warning?: string }) => void,
      ) => () => void;
      onCameraDetail: (fn: (update: CameraDetailUpdate) => void) => () => void;
    };
  }
}
