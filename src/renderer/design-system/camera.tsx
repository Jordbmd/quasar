import { t, getLanguage } from "../../shared/i18n";
import { displayValue } from "../format";
import React from "react";
import { Camera as CameraIcon, Activity, MonitorPlay } from "lucide-react";
import type { Camera, DiagnosticReport, LogEntry } from "../../shared/types";
import { Badge, Button, EmptyState } from "./components";
export function CameraCard({
  camera: c,
  selected = false,
  disabled = false,
  onSelect,
}: {
  camera: Camera;
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      className={`camera-row ${selected ? "selected" : ""}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="camera-row-info">
        <strong>{c.name || c.model || t("Caméra ONVIF")}</strong>
        <code>{c.ip}</code>
        {c.model && c.model !== c.name && <small>{c.model}</small>}
        <Badge
          kind={
            c.ambiguous || c.status.startsWith("Erreur")
              ? "danger"
              : c.status.startsWith("Connectée")
                ? "success"
                : "neutral"
          }
        >
          {c.ambiguous
            ? t("Conflit d’identité")
            : c.status.startsWith("Connectée")
              ? t("Connectée")
              : c.status.startsWith("Erreur")
                ? t("Erreur de connexion")
                : t("À connecter")}
        </Badge>
      </span>
    </Button>
  );
}
export function CameraFacts({
  camera,
  children,
}: {
  camera?: Camera;
  children?: React.ReactNode;
}) {
  return (
    <div className="camera-facts">
      <h3>{t("Informations de la caméra")}</h3>
      <dl>
        {[
          [t("Modèle"), camera?.model],
          [t("Numéro de série"), camera?.serial],
          [t("Adresse MAC"), camera?.mac],
          [t("Version du firmware"), camera?.firmware],
          [t("Adresse IP"), camera?.ip],
          [t("Port ONVIF"), camera?.port],
          [
            t("État de connexion"),
            camera?.status ? t(camera.status) : undefined,
          ],
        ].map(([label, v]) => (
          <div key={String(label)}>
            <dt>{t(String(label))}</dt>
            <dd>{displayValue(v)}</dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}
export function VideoPlaceholder({
  selected = false,
  connected = false,
}: {
  selected?: boolean;
  connected?: boolean;
}) {
  return (
    <EmptyState
      className="preview-placeholder"
      icon={MonitorPlay}
      title={
        selected ? t("Aperçu vidéo") : t("Le flux de la caméra apparaîtra ici")
      }
    >
      {connected
        ? t("Lancez le flux du profil sélectionné.")
        : t("Aucun flux chargé")}
    </EmptyState>
  );
}
const labels = {
  passed: "Réussi",
  failed: "Échec",
  unsupported: "Non pris en charge",
  untested: "Non testé",
};
export function DiagnosticResults({ report }: { report?: DiagnosticReport }) {
  return report ? (
    <div className="checks-grid">
      {report.checks.map((c) => (
        <article key={c.key} className="diagnostic-check">
          <div>
            <strong>{t(c.label)}</strong>
            <Badge
              kind={
                c.state === "passed"
                  ? "success"
                  : c.state === "failed"
                    ? "danger"
                    : c.state
              }
            >
              {t(labels[c.state])}
            </Badge>
          </div>
          <p>{t(c.detail)}</p>
        </article>
      ))}
    </div>
  ) : (
    <EmptyState
      className="empty-diagnostic"
      icon={Activity}
      title={t("Aucun diagnostic effectué")}
    >
      {t(
        "Sélectionnez une caméra puis lancez les tests. Les mesures apparaîtront ici.",
      )}
    </EmptyState>
  );
}
export function EventLog({ entries }: { entries: LogEntry[] }) {
  return (
    <div className="log-table">
      <table>
        <caption className="sr-only">
          {t("Journal des événements locaux")}
        </caption>
        <thead>
          <tr>
            {[
              t("Heure"),
              t("Caméra"),
              t("Niveau"),
              t("Événement"),
              "Description",
            ].map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...entries].reverse().map((l, i) => (
            <tr key={`${l.at}-${i}`}>
              <td>
                <code>{new Date(l.at).toLocaleTimeString(getLanguage())}</code>
              </td>
              <td>
                <code>{l.camera || "—"}</code>
              </td>
              <td>
                <Badge
                  kind={
                    l.level === "erreur"
                      ? "danger"
                      : l.level === "attention"
                        ? "warning"
                        : "info"
                  }
                >
                  {l.level === "erreur"
                    ? t("Erreur")
                    : l.level === "attention"
                      ? t("Avertissement")
                      : t("Information")}
                </Badge>
              </td>
              <td>{t(l.event)}</td>
              <td>{t(l.detail)}</td>
            </tr>
          ))}
          {!entries.length && (
            <tr>
              <td colSpan={5}>{t("Aucun événement dans cette session.")}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
