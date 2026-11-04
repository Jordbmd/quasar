import { t } from "../shared/i18n";
/** Absence is distinct from a legitimate zero, false or empty value. */
export function displayValue(value: unknown): string {
  if (value === undefined || value === null) return t("Non disponible");
  if (value === "") return t("Vide");
  if (typeof value === "boolean") return value ? t("Oui") : t("Non");
  return String(value);
}
export function displayDefaultValue(value: string | number | boolean) {
  if (typeof value === "boolean") return t(value ? "Activé" : "Désactivé");
  return value === "" ? t("Non renseigné") : String(value);
}
