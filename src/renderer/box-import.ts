import { t } from "../shared/i18n";
import { validateWorkbookArchive } from "../shared/workbook-archive";
import { read, utils } from "xlsx";
import { parseBoxRows } from "../shared/box";
import { readProductionInfo } from "./box-production";

export function decodeBoxFile(bytes: ArrayBuffer, filename: string) {
  if (!/\.(xlsx|xls|ods|csv)$/i.test(filename))
    throw Error("Choisissez un fichier XLSX, XLS, ODS ou CSV.");
  if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024)
    throw Error(
      t("Le fichier doit contenir des données et faire moins de 5 Mo."),
    );
  validateWorkbookArchive(bytes);
  const csv = /\.csv$/i.test(filename);
  let content: ArrayBuffer | string = bytes;
  if (csv) {
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      content = new TextDecoder("windows-1252").decode(bytes);
    }
  }
  const book = read(content, {
    type: csv ? "string" : "array",
    sheetRows: 1000,
    sheets: csv
      ? undefined
      : ["Back office", "Infos Box", "Config", "Plan de cablage"],
    cellFormula: true,
  });
  const sheet = /\.csv$/i.test(filename)
    ? book.Sheets[book.SheetNames[0]]
    : book.Sheets["Back office"];
  if (!sheet) throw Error("La feuille « Back office » est introuvable.");
  const range = utils.decode_range(sheet["!fullref"] ?? sheet["!ref"] ?? "A1");
  if (range.e.r >= 1000)
    throw Error(
      t(
        "La feuille dépasse 1 000 lignes. Importez uniquement la configuration des casiers.",
      ),
    );
  for (let row = 0; row <= range.e.r; row++) {
    for (let column = 0; column < 6; column++) {
      if (sheet[utils.encode_cell({ r: row, c: column })]?.f)
        throw Error(
          `Ligne ${row + 1} : remplacez les formules par leurs valeurs avant l’import.`,
        );
    }
  }
  const base = parseBoxRows(
    utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
      range: { s: { r: 0, c: 0 }, e: { r: range.e.r, c: 5 } },
    }),
    filename.replace(/\.[^.]+$/, "").slice(0, 160),
  );
  return readProductionInfo(book, base, filename);
}
