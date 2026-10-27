import { contextBridge, ipcRenderer } from "electron";
import { channels, type Events, type Reply } from "../shared/ipc";
import type { Api, Call } from "../shared/types";

const call: Call = async <K extends keyof Api>(
  method: K,
  input: Api[K]["input"],
) => {
  const result: Reply<Api[K]["output"]> = await ipcRenderer.invoke(
    channels.call,
    method,
    input,
  );
  if (!result.ok)
    throw Object.assign(new Error(result.error), { code: result.code });
  return result.value as Api[K]["output"];
};
function subscribe<K extends keyof Events>(
  key: K,
  callback: (value: Events[K]) => void,
) {
  // Never expose the privileged Electron event object to the renderer.
  const listener = (_event: unknown, value: Events[K]) => callback(value);
  ipcRenderer.on(channels[key], listener);
  return () => ipcRenderer.removeListener(channels[key], listener);
}
const bridge: Window["sezaam"] = {
  call,
  onFactoryResetProgress: (fn) => subscribe("reset", fn),
  onAddressProgress: (fn) => subscribe("addressing", fn),
  onDefaultsProgress: (fn) => subscribe("defaults", fn),
  onPreviewLighting: (fn) => subscribe("lighting", fn),
  onCameraDetail: (fn) => subscribe("detail", fn),
  onNetworkChanged: (fn) => subscribe("network", fn),
  onInvalidated: (fn) => subscribe("invalidated", fn),
};
contextBridge.exposeInMainWorld("sezaam", Object.freeze(bridge));
