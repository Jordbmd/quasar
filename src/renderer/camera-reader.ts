import type { CameraDetail, Call, CameraDetailUpdate } from "../shared/types";
/** Owns only progressive reads. Selection, drafts and playback stay independent. */
export class CameraReader {
  private revision = 0;
  private unsubscribe?: () => void;
  constructor(
    private bridge: {
      call: Call;
      onCameraDetail: (fn: (update: CameraDetailUpdate) => void) => () => void;
    },
  ) {}
  cancel() {
    this.revision++;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
  async read(
    id: string,
    fresh: boolean,
    isSelected: () => boolean,
    accept: (detail: CameraDetail) => void,
    scope?: "network",
  ) {
    this.cancel();
    const revision = this.revision,
      requestId = `detail:${revision}`;
    const current = () => revision === this.revision && isSelected();
    const publish = (detail: CameraDetail) => {
      if (current() && detail.camera.id === id) accept(detail);
    };
    const unsubscribe = this.bridge.onCameraDetail((update) => {
      if (update.requestId === requestId) publish(update.detail);
    });
    this.unsubscribe = unsubscribe;
    try {
      const detail = await this.bridge.call(
        fresh ? "readCamera" : "selectCamera",
        { id, requestId, ...(fresh && scope ? { scope } : {}) },
      );
      publish(detail);
      return detail;
    } finally {
      unsubscribe();
      if (this.unsubscribe === unsubscribe) this.unsubscribe = undefined;
    }
  }
}
