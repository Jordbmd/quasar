import { schemas } from "../shared/ipc-schemas";
import { operationMode, type Reply } from "../shared/ipc";
import type { Api } from "../shared/types";
import type { CameraService } from "./service";
import type { Diagnostics } from "./diagnostics";

/** Electron checks the sender; this testable controller owns validation and locking. */
export class IpcController {
  private busy = false;
  constructor(
    private service: CameraService,
    private logs: Diagnostics,
    private copyLogs: () => void,
  ) {}
  async call(method: unknown, input: unknown): Promise<Reply> {
    if (typeof method !== "string" || !Object.hasOwn(schemas, method))
      return { ok: false, code: "INVALID_REQUEST", error: "Action inconnue." };
    const action = method as keyof Api;
    const mode = operationMode[action];
    try {
      // Validation applies equally to cancellation and clipboard operations.
      schemas[action].parse(input);
    } catch (error) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        error: this.logs.safe(error),
      };
    }
    if (this.busy && mode !== "snapshot" && mode !== "cancel")
      return {
        ok: false,
        code: "BUSY",
        error: "Une opération est en cours. Patientez avant la suivante.",
      };
    if (mode === "exclusive") this.busy = true;
    try {
      if (action === "copyLogs") {
        this.copyLogs();
        return { ok: true };
      }
      if (action === "stopVideo") {
        await this.service.stopVideo();
        return { ok: true };
      }
      if (action === "cancelCameraRead") {
        await this.service.cancelCameraRead();
        return { ok: true };
      }
      if (mode === "exclusive") {
        await this.service.stopVideo();
        await this.service.cancelCameraRead();
        await this.service.finishPreviewLighting();
      }
      // dispatch validates the unknown payload too, including calls from domain workflows.
      return {
        ok: true,
        value: await this.service.dispatch(
          action,
          input as Api[keyof Api]["input"],
        ),
      };
    } catch (error) {
      const message = this.logs.safe(error);
      const cancelled =
        error instanceof Error && "code" in error && error.code === "CANCELLED";
      if (!cancelled) this.logs.add("erreur", action, message);
      return {
        ok: false,
        code: cancelled ? "CANCELLED" : "FAILED",
        error: message,
      };
    } finally {
      if (mode === "exclusive") this.busy = false;
    }
  }
}
