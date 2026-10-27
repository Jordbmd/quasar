/** Absence is distinct from a legitimate zero, false or empty value. */
export function displayValue(value: unknown): string {
  if (value === undefined || value === null) return "Non disponible";
  if (value === "") return "Vide";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  return String(value);
}
