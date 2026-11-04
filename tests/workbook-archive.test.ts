import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { validateWorkbookArchive } from "../src/shared/workbook-archive";
function archive(files: Record<string, Uint8Array>) {
  return zipSync(files).buffer as ArrayBuffer;
}
describe("Workbook decompression budget", () => {
  it("accepts a small workbook archive without extracting paths", () => {
    expect(() =>
      validateWorkbookArchive(
        archive({ "xl/workbook.xml": new TextEncoder().encode("<workbook/>") }),
      ),
    ).not.toThrow();
  });
  it("rejects highly compressed oversized entries before SheetJS", () => {
    const bytes = archive({
      "xl/sharedStrings.xml": new Uint8Array(17 * 1024 * 1024),
    });
    expect(bytes.byteLength).toBeLessThan(5 * 1024 * 1024);
    expect(() => validateWorkbookArchive(bytes)).toThrow(/limite/);
  });
  it("rejects malformed and too many entries", () => {
    expect(() =>
      validateWorkbookArchive(new Uint8Array([0x50, 0x4b, 1]).buffer),
    ).toThrow(/Archive/);
    expect(() =>
      validateWorkbookArchive(
        archive(
          Object.fromEntries(
            Array.from({ length: 1001 }, (_, i) => [
              `file${i}`,
              new Uint8Array(),
            ]),
          ),
        ),
      ),
    ).toThrow(/fichiers/);
  });
});
