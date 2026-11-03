import { Unzip, UnzipInflate } from "fflate";
import { t } from "./i18n";
/** Inspect actual decompressed bytes before SheetJS, without retaining or extracting entries. */
export function validateWorkbookArchive(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return; // CSV and legacy OLE XLS.
  const names = new Set<string>();
  let total = 0;
  let completed = 0;
  let failure: Error | undefined;
  const unzip = new Unzip((file) => {
    if (names.has(file.name) || names.size >= 1000)
      throw Error(t("Archive invalide ou trop de fichiers."));
    names.add(file.name);
    let size = 0;
    file.ondata = (error, data, final) => {
      if (error) throw failure ?? Error(t("Archive de classeur invalide."));
      size += data.length;
      total += data.length;
      if (size > 16 * 1024 * 1024 || total > 64 * 1024 * 1024) {
        file.terminate();
        failure = Error(
          t("Le classeur décompressé dépasse la limite autorisée."),
        );
        throw failure;
      }
      if (final) completed++;
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    for (let offset = 0; offset < bytes.length; offset += 32768)
      unzip.push(
        bytes.subarray(offset, offset + 32768),
        offset + 32768 >= bytes.length,
      );
    if (!names.size || completed !== names.size)
      throw Error(t("Archive de classeur invalide."));
  } catch (error) {
    if (
      error instanceof Error &&
      [
        t("Archive invalide ou trop de fichiers."),
        t("Archive de classeur invalide."),
        t("Le classeur décompressé dépasse la limite autorisée."),
      ].includes(error.message)
    )
      throw error;
    throw Error(t("Archive de classeur invalide."));
  }
}
