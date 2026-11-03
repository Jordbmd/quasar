import { setLanguage, t, type Language } from "../shared/i18n";
import { decodeBoxFile } from "./box-import";
self.onmessage = (
  event: MessageEvent<{
    bytes: ArrayBuffer;
    filename: string;
    language: Language;
  }>,
) => {
  setLanguage(event.data.language === "en" ? "en" : "fr");
  try {
    self.postMessage({
      box: decodeBoxFile(event.data.bytes, event.data.filename),
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? t(error.message) : t("Import impossible."),
    });
  }
};
