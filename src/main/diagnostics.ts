import type { LogEntry } from "../shared/types";
export function redact(value: unknown, secrets: string[] = []): string {
  let s = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  for (const secret of secrets
    .filter(Boolean)
    .sort((a, b) => b.length - a.length))
    s = s.split(secret).join("[masqué]");
  return s
    .replace(
      /("(?:password|passwd|authorization|token|secret|username)"\s*:\s*)"(?:\\.|[^"\\])*"/gi,
      '$1"[masqué]"',
    )
    .replace(/(authorization\s*[:=]\s*)(?:Bearer|Basic)\s+\S+/gi, "$1[masqué]")
    .replace(/\b(?:rtsp|rtsps|https?):\/\/[^\s"<>]+/gi, "[URL masquée]")
    .replace(
      /((?:password|passwd|authorization|token|secret|username)[\"']?\s*[=:]\s*[\"']?)[^\s,;}\"']+/gi,
      "$1[masqué]",
    )
    .replace(
      /<(?:\w+:)?(?:Password|Nonce|Username)[^>]*>[\s\S]*?<\/(?:\w+:)?(?:Password|Nonce|Username)>/gi,
      "[masqué]",
    );
}
export class Diagnostics {
  entries: LogEntry[] = [];
  secrets = new Set<string>();
  add(level: string, event: string, detail: unknown = "", camera?: string) {
    this.entries.push({
      at: new Date().toISOString(),
      camera,
      level,
      event,
      detail: redact(detail, [...this.secrets]),
    });
    this.entries = this.entries.slice(-500);
  }
  safe(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return redact(
      message === "Network timeout"
        ? "Délai de réponse dépassé : la caméra n’a pas répondu à temps (Network timeout)."
        : message,
      [...this.secrets],
    );
  }
}
export async function bounded<T>(
  work: Promise<T>,
  ms: number,
  onTimeout: () => void = () => {},
): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        onTimeout();
        reject(
          new Error(
            "Délai dépassé. Résultat incertain : relire avant toute nouvelle écriture.",
          ),
        );
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer!));
}
export async function reconnect<T>(
  read: () => Promise<T>,
  verify: (value: T) => boolean,
  attempts = 5,
  delay = 1200,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const v = await read();
      if (!verify(v))
        throw new Error("Identité différente ou configuration non confirmée.");
      return v;
    } catch (e) {
      last = e;
    }
    if (i + 1 < attempts) await new Promise((r) => setTimeout(r, delay));
  }
  throw last;
}
