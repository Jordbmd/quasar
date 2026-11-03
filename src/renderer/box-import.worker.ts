import { decodeBoxFile } from "./box-import";
self.onmessage = (
  event: MessageEvent<{ bytes: ArrayBuffer; filename: string }>,
) => {
  try {
    self.postMessage({
      box: decodeBoxFile(event.data.bytes, event.data.filename),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Import impossible.",
    });
  }
};
