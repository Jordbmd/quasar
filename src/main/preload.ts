import type { DefaultsProgress } from "../shared/defaults";
import type { FactoryResetPlan } from "../shared/factory-reset";
import { contextBridge, ipcRenderer } from "electron";
import type { Call, NetworkState, CameraDetailUpdate } from "../shared/types";
const call: Call = async (method, input) => {
  const result = await ipcRenderer.invoke("sezaam:call", method, input);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
contextBridge.exposeInMainWorld(
  "sezaam",
  Object.freeze({
    call,
    onFactoryResetProgress: (fn: (update: FactoryResetPlan) => void) => {
      const listener = (_: unknown, update: FactoryResetPlan) => fn(update);
      ipcRenderer.on("sezaam:factory-reset-progress", listener);
      return () =>
        ipcRenderer.removeListener("sezaam:factory-reset-progress", listener);
    },
    onDefaultsProgress: (fn: (update: DefaultsProgress) => void) => {
      const listener = (_: unknown, update: DefaultsProgress) => fn(update);
      ipcRenderer.on("sezaam:defaults-progress", listener);
      return () =>
        ipcRenderer.removeListener("sezaam:defaults-progress", listener);
    },
    onPreviewLighting: (
      fn: (update: { id: string; url: string; warning?: string }) => void,
    ) => {
      const listener = (
        _: unknown,
        update: { id: string; url: string; warning?: string },
      ) => fn(update);
      ipcRenderer.on("sezaam:preview-lighting", listener);
      return () =>
        ipcRenderer.removeListener("sezaam:preview-lighting", listener);
    },
    onCameraDetail: (fn: (update: CameraDetailUpdate) => void) => {
      const listener = (_: unknown, update: CameraDetailUpdate) => fn(update);
      ipcRenderer.on("sezaam:camera-detail", listener);
      return () => ipcRenderer.removeListener("sezaam:camera-detail", listener);
    },
    onNetworkChanged: (fn: (network: NetworkState) => void) => {
      const listener = (_: unknown, network: NetworkState) => fn(network);
      ipcRenderer.on("sezaam:network", listener);
      return () => ipcRenderer.removeListener("sezaam:network", listener);
    },
    onInvalidated: (fn: (reason: string) => void) => {
      const listener = (_: unknown, reason: string) => fn(reason);
      ipcRenderer.on("sezaam:invalidated", listener);
      return () => ipcRenderer.removeListener("sezaam:invalidated", listener);
    },
  }),
);
