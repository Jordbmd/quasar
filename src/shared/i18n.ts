import translations from "./translations.json";

export type Language = "fr" | "en";
let language: Language = "fr";
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export function setLanguage(next: Language) {
  if (next === language) return;
  language = next;
  for (const listener of listeners) listener();
}
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** Translate authored UI messages only. Never pass camera names, settings or identifiers. */
export function t(source: string, ...values: (string | number)[]) {
  const message =
    language === "en" && Object.hasOwn(translations, source)
      ? (translations as Record<string, string>)[source]
      : source;
  return message.replace(/\{(\d+)\}/g, (_, index: string) =>
    String(values[Number(index)] ?? `{${index}}`),
  );
}
