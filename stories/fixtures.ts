// Development fixtures only. No Electron import, transport, IP socket or real camera operation.
import type {
  Camera,
  CameraDetail,
  AppState,
  DiagnosticReport,
  Call,
} from "../src/shared/types";
export const camera: Camera = {
  id: "simulation-1",
  ip: "192.0.2.101",
  port: 80,
  path: "/onvif/device_service",
  name: "Caméra Atelier — SIMULATION",
  model: "Modèle de démonstration",
  manufacturer: "SIMULATION",
  serial: "DEMO-001",
  mac: "02:00:00:00:00:01",
  firmware: "SIMULATION 1.0",
  status: "Connectée · lecture seule",
  ambiguous: false,
};
const available = (data: unknown) => ({ state: "available" as const, data });
export const detail: CameraDetail = {
  camera,
  network: available([
    {
      $: { token: "eth1" },
      IPv4: {
        config: {
          DHCP: false,
          manual: [{ address: camera.ip, prefixLength: 24 }],
        },
      },
    },
  ]),
  gateway: available({ IPv4Address: "192.0.2.1" }),
  dns: available({
    fromDHCP: false,
    DNSManual: [{ IPv4Address: "192.0.2.1" }],
  }),
  video: available([
    {
      profile: "main",
      name: "Flux principal",
      config: {
        $: { token: "enc1" },
        encoding: "H264",
        resolution: { width: 1920, height: 1080 },
        rateControl: { frameRateLimit: 25, bitrateLimit: 2048 },
        quality: 4,
        H264: { govLength: 50 },
      },
      options: available({
        H264: {
          resolutionsAvailable: [
            { width: 1920, height: 1080 },
            { width: 1280, height: 720 },
          ],
          frameRateRange: { min: 1, max: 30 },
          bitrateRange: { min: 128, max: 8192 },
          govLengthRange: { min: 1, max: 100 },
        },
        qualityRange: { min: 1, max: 6 },
      }),
    },
  ]),
  profiles: [{ $: { token: "main" }, name: "Flux principal" }],
  osd: available({
    settings: [
      {
        token: "name",
        type: "Text",
        text: "Atelier — SIMULATION",
        position: "LowerLeft",
      },
    ],
  }),
  image: { state: "unverified" },
  lighting: { state: "unverified" },
  capabilities: available({}),
  osdRestoreAvailable: false,
};
export const report: DiagnosticReport = {
  cameraId: camera.id,
  ip: camera.ip,
  at: "2026-10-19T10:00:00Z",
  checks: [
    {
      key: "network",
      label: "Accessibilité réseau",
      state: "passed",
      detail: "SIMULATION — réponse reçue en 2 ms.",
    },
    {
      key: "video",
      label: "Flux vidéo",
      state: "failed",
      detail: "SIMULATION — délai dépassé, vérifiez le profil vidéo.",
    },
    {
      key: "osd",
      label: "Configuration OSD",
      state: "unsupported",
      detail: "SIMULATION — fonction non exposée par ce modèle.",
    },
    {
      key: "firmware",
      label: "Firmware",
      state: "untested",
      detail: "SIMULATION — aucune mise à jour effectuée.",
    },
  ],
};
export const state: AppState = {
  platform: "darwin",
  arch: "arm64",
  network: {
    ready: true,
    reason: "SIMULATION",
    overlaps: [],
    adapter: {
      id: "en-demo",
      service: "Ethernet — SIMULATION",
      label: "Hub RJ45",
      kind: "ethernet",
      enabled: true,
      link: true,
      address: "192.0.2.10",
      mask: "255.255.255.0",
      router: "",
      dns: [],
      mode: "dhcp",
      mac: "02:00:00:00:00:02",
      clientId: "",
      raw: "",
      mtu: 1500,
      media: "1000baseT",
    },
  },
  cameras: [
    camera,
    {
      ...camera,
      id: "simulation-2",
      ip: "192.0.2.102",
      name: "Caméra Entrée — SIMULATION",
      status: "Découverte · non authentifiée",
    },
    {
      ...camera,
      id: "simulation-3",
      ip: "192.0.2.103",
      name: "Caméra Parking — SIMULATION",
      status: "Erreur de connexion",
    },
    {
      ...camera,
      id: "simulation-4",
      name: "Conflit — SIMULATION",
      ambiguous: true,
    },
  ],
  session: { active: false, connected: 0, total: 4, failures: [] },
  reports: [report],
  logs: [
    {
      at: "2026-10-19T10:00:00Z",
      camera: camera.ip,
      level: "info",
      event: "Diagnostic simulé",
      detail: "Aucun matériel contacté.",
    },
    {
      at: "2026-10-19T10:00:01Z",
      level: "erreur",
      event: "Flux vidéo",
      detail: "SIMULATION — délai dépassé.",
    },
  ],
  videoReady: false,
};
export function installMock() {
  localStorage.setItem(
    "quasar-preferences",
    JSON.stringify({
      autoplay: false,
      lowLatency: true,
      previewQuality: "light",
    }),
  );
  const current = structuredClone(state);
  current.cameras.forEach((c) => {
    c.status = "Découverte · non authentifiée";
  });
  window.sezaam = {
    onNetworkChanged: () => () => {},
    onCameraDetail: () => () => {},
    onInvalidated: () => () => {},
    call: (async (method: string) => {
      if (method === "state") return structuredClone(current);
      if (method === "discover") return structuredClone(current.cameras);
      if (method === "connectSession") {
        current.session = {
          active: true,
          username: "admin",
          connected: 3,
          total: 4,
          failures: [],
        };
        current.cameras.forEach((c) => {
          if (!c.ambiguous) c.status = "Connectée · lecture seule";
        });
        return structuredClone(current.session);
      }
      if (method === "readCamera" || method === "selectCamera")
        return structuredClone(detail);
      if (method === "diagnose") return structuredClone(report);
      if (method === "previewProfiles") return structuredClone(detail.profiles);
      if (method === "stopVideo") return;
      throw Error("SIMULATION : cette action est désactivée dans Storybook.");
    }) as Call,
  };
}
