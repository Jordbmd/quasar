import { it, expect, vi } from "vitest";
import { IpcController } from "../src/main/ipc-controller";
import { CameraService } from "../src/main/service";
import { Diagnostics } from "../src/main/diagnostics";
import { schemas } from "../src/shared/ipc-schemas";
import { operationMode } from "../src/shared/ipc";
it("déclare une politique pour chaque action validée", () =>
  expect(Object.keys(schemas).sort()).toEqual(
    Object.keys(operationMode).sort(),
  ));
it("valide aussi annulation/presse-papiers et laisse les instantanés consultables pendant une écriture", async () => {
  let done!: () => void;
  const pending = new Promise<void>((resolve) => {
    done = resolve;
  });
  const service = Object.assign(Object.create(CameraService.prototype), {
    stopVideo: vi.fn(async () => {}),
    cancelCameraRead: vi.fn(async () => {}),
    finishPreviewLighting: vi.fn(async () => {}),
    dispatch: vi.fn(async (method: string) =>
      method === "discover" ? pending : { ready: false },
    ),
  }) as CameraService;
  const copy = vi.fn(),
    ipc = new IpcController(service, new Diagnostics(), copy);
  expect(await ipc.call("unknown", undefined)).toMatchObject({
    ok: false,
    code: "INVALID_REQUEST",
  });
  expect(await ipc.call("copyLogs", {})).toMatchObject({
    ok: false,
    code: "INVALID_REQUEST",
  });
  expect(copy).not.toHaveBeenCalled();
  expect(await ipc.call("stopVideo", {})).toMatchObject({
    ok: false,
    code: "INVALID_REQUEST",
  });
  const work = ipc.call("discover", undefined);
  await Promise.resolve();
  expect(await ipc.call("state", undefined)).toMatchObject({ ok: true });
  expect(await ipc.call("discover", undefined)).toMatchObject({
    ok: false,
    code: "BUSY",
  });
  expect(await ipc.call("cancelCameraRead", undefined)).toMatchObject({
    ok: true,
  });
  done();
  expect(await work).toMatchObject({ ok: true });
  expect(await ipc.call("copyLogs", undefined)).toMatchObject({ ok: true });
  expect(copy).toHaveBeenCalledOnce();
});
