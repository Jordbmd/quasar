import type { DefaultsPlan, DefaultValue, DefaultRow } from "./defaults";
import type { FieldAudit } from "./default-support";
export type IssueCode =
  | "AUTHENTICATION_FAILED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "ACTION_UNSUPPORTED"
  | "VALUE_REJECTED"
  | "IDENTITY_CHANGED"
  | "IDENTITY_UNVERIFIED"
  | "PREVIOUS_UNVERIFIED"
  | "STALE_PLAN"
  | "NETWORK_CHANGED"
  | "WRITE_FAILED"
  | "READBACK_FAILED"
  | "READBACK_MISMATCH"
  | "NOT_IMPLEMENTED"
  | "MAPPING_REQUIRED"
  | "VENDOR_REQUIRED"
  | "MANUAL_STEP"
  | "CAPABILITY_UNAVAILABLE"
  | "VALUE_NOT_SUPPORTED"
  | "VERIFIED"
  | "ALREADY_MATCHES"
  | "SKIPPED_AFTER_FAILURE"
  | "INTERRUPTED";
export type OperationIssue = {
  stage: "send" | "readback";
  code: IssueCode;
  message: string;
};
export type FieldVerification = {
  verified: boolean;
  observed?: DefaultValue;
  issues?: OperationIssue[];
};
export type FieldTrace = {
  code?: IssueCode;
  method?: string;
  startedAt?: string;
  finishedAt?: string;
  sent?: boolean;
  acknowledged?: boolean;
  observed?: DefaultValue;
  issues?: OperationIssue[];
};
export type ProfileRun = DefaultsPlan & {
  kind: "audit" | "apply";
  status: "running" | "complete" | "interrupted";
  startedAt: string;
  updatedAt: string;
  audit?: { cameraId: string; fields: FieldAudit[] }[];
  journalWarning?: string;
};
export type ProfileRunSummary = Pick<
  ProfileRun,
  "id" | "name" | "revision" | "kind" | "status" | "startedAt" | "updatedAt"
> & {
  cameras: number;
  verified: number;
  failed: number;
  blocked: number;
  pending: number;
  unread: number;
  manual: number;
};
export function rowCategory(row: DefaultRow) {
  if (row.state === "blocked")
    return row.code === "ACTION_UNSUPPORTED" ||
      row.code === "VALUE_NOT_SUPPORTED"
      ? "unavailable"
      : "unread";
  return row.state;
}
export function rowStatus(row: DefaultRow) {
  return {
    ready: "À appliquer",
    same: "Déjà conforme",
    manual: "Non automatisé",
    unavailable: "Non pris en charge",
    unread: "Non vérifié · lecture / contrôle impossible",
    verified: "Relu et vérifié",
    failed: "Échec / non confirmé",
    skipped: "Non exécuté",
  }[rowCategory(row)];
}
export function countRows(rows: DefaultRow[]) {
  const count = (category: string) =>
    rows.filter((r) => rowCategory(r) === category).length;
  return {
    ready: count("ready"),
    same: count("same"),
    verified: count("verified"),
    unavailable: count("unavailable"),
    unread: count("unread"),
    manual: count("manual"),
    failed: count("failed"),
    skipped: count("skipped"),
  };
}
export function summarizeRun(run: ProfileRun): ProfileRunSummary {
  const rows = run.cameras.flatMap((c) => c.rows);
  const counts = countRows(rows);
  return {
    id: run.id,
    name: run.name,
    revision: run.revision,
    kind: run.kind,
    status: run.status,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    cameras: run.cameras.length,
    verified: rows.filter((r) => r.state === "verified").length,
    failed: rows.filter((r) => r.state === "failed").length,
    blocked: counts.unavailable,
    unread: counts.unread,
    manual: counts.manual,
    pending: rows.filter((r) => r.state === "ready" || r.state === "skipped")
      .length,
  };
}
export function issueCode(
  message: string,
  fallback: IssueCode = "WRITE_FAILED",
): IssueCode {
  if (
    /401|403|unauthori|notauthorized|authentification|identifiants|accès refusé/i.test(
      message,
    )
  )
    return "AUTHENTICATION_FAILED";
  if (/timeout|timed out|délai|expir/i.test(message)) return "TIMEOUT";
  if (
    /EHOST|ENET|ECONN|socket|connexion fermée|connexion API web interrompue|hors ligne|injoignable/i.test(
      message,
    )
  )
    return "NETWORK_ERROR";
  if (
    /ActionNotSupported|not supported|not implemented|Optional Action/i.test(
      message,
    )
  )
    return "ACTION_UNSUPPORTED";
  if (/InvalidArg|ConfigModify|valeur refus/i.test(message))
    return "VALUE_REJECTED";
  if (/identité.*non vérifiable/i.test(message)) return "IDENTITY_UNVERIFIED";
  if (/identité|identités|ambigu/i.test(message)) return "IDENTITY_CHANGED";
  if (/précédent incertain/i.test(message)) return "PREVIOUS_UNVERIFIED";
  if (/réseau.*(chang|modifi|interromp)|Ethernet/i.test(message))
    return "NETWORK_CHANGED";
  if (/chang|relisez puis recommencez/i.test(message)) return "STALE_PLAN";
  return fallback;
}
export const issueLabels: Record<IssueCode, string> = {
  AUTHENTICATION_FAILED: "Authentification refusée",
  TIMEOUT: "Délai dépassé",
  NETWORK_ERROR: "Connexion indisponible",
  ACTION_UNSUPPORTED: "Action refusée comme non prise en charge",
  VALUE_REJECTED: "Valeur refusée",
  IDENTITY_CHANGED: "Identité à vérifier",
  IDENTITY_UNVERIFIED: "Identité non vérifiée",
  PREVIOUS_UNVERIFIED: "Écriture précédente incertaine",
  STALE_PLAN: "Configuration modifiée",
  NETWORK_CHANGED: "Réseau modifié",
  WRITE_FAILED: "Écriture échouée",
  READBACK_FAILED: "Relecture impossible",
  READBACK_MISMATCH: "Valeur relue différente",
  NOT_IMPLEMENTED: "Adaptateur à intégrer",
  MAPPING_REQUIRED: "Correspondance à valider",
  VENDOR_REQUIRED: "API constructeur requise",
  MANUAL_STEP: "Étape séparée",
  CAPABILITY_UNAVAILABLE: "Capacité non vérifiée",
  VALUE_NOT_SUPPORTED: "Valeur incompatible",
  VERIFIED: "Relu et vérifié",
  ALREADY_MATCHES: "Déjà conforme",
  SKIPPED_AFTER_FAILURE: "Non exécuté après un échec",
  INTERRUPTED: "Exécution interrompue",
};
