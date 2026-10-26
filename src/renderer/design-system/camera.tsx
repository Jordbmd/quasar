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
        <strong>{c.name || c.model || "Caméra ONVIF"}</strong>
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
            ? "Conflit d’identité"
            : c.status.startsWith("Connectée")
              ? "Connectée"
              : c.status.startsWith("Erreur")
                ? "Erreur de connexion"
                : "À connecter"}
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
      <h3>Informations de la caméra</h3>
      <dl>
        {[
          ["Modèle", camera?.model],
          ["Numéro de série", camera?.serial],
          ["Adresse MAC", camera?.mac],
          ["Version du firmware", camera?.firmware],
          ["Adresse IP", camera?.ip],
          ["Port ONVIF", camera?.port],
          ["État de connexion", camera?.status],
        ].map(([label, v]) => (
          <div key={String(label)}>
            <dt>{label}</dt>
            <dd>{v ? String(v) : "Non disponible"}</dd>
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
      title={selected ? "Aperçu vidéo" : "Le flux de la caméra apparaîtra ici"}
    >
      {connected
        ? "Lancez le flux du profil sélectionné."
        : "Aucun flux chargé"}
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
            <strong>{c.label}</strong>
            <Badge
              kind={
                c.state === "passed"
                  ? "success"
                  : c.state === "failed"
                    ? "danger"
                    : c.state
              }
            >
              {labels[c.state]}
            </Badge>
          </div>
          <p>{c.detail}</p>
        </article>
      ))}
    </div>
  ) : (
    <EmptyState
      className="empty-diagnostic"
      icon={Activity}
      title="Aucun diagnostic effectué"
    >
      Sélectionnez une caméra puis lancez les tests. Les mesures apparaîtront
      ici.
    </EmptyState>
  );
}
export function EventLog({ entries }: { entries: LogEntry[] }) {
  return (
    <div className="log-table">
      <table>
        <caption className="sr-only">Journal des événements locaux</caption>
        <thead>
          <tr>
            {["Heure", "Caméra", "Niveau", "Événement", "Description"].map(
              (h) => (
                <th scope="col" key={h}>
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {[...entries].reverse().map((l, i) => (
            <tr key={`${l.at}-${i}`}>
              <td>
                <code>{new Date(l.at).toLocaleTimeString()}</code>
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
                    ? "Erreur"
                    : l.level === "attention"
                      ? "Avertissement"
                      : "Information"}
                </Badge>
              </td>
              <td>{l.event}</td>
              <td>{l.detail}</td>
            </tr>
          ))}
          {!entries.length && (
            <tr>
              <td colSpan={5}>Aucun événement dans cette session.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
