import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  defaultValueLabel,
  type DefaultRow,
  type DefaultsCameraPlan,
  type DefaultsPlan,
} from "../shared/defaults";
import { issueLabels, rowCategory, rowStatus } from "../shared/profile-journal";
import { Alert, Button } from "./design-system/components";
import type { Run } from "./ui";

// Priorities apply within each camera; cameras always stay in ascending IP order.
const sections = [
  {
    id: "errors",
    label: "Erreurs et contrôles à reprendre",
    categories: ["failed", "unread", "skipped"],
  },
  { id: "manual", label: "Intervention manuelle", categories: ["manual"] },
  {
    id: "unsupported",
    label: "Non pris en charge",
    categories: ["unavailable"],
  },
  { id: "ready", label: "À appliquer", categories: ["ready"] },
  { id: "ok", label: "Conformes", categories: ["same", "verified"] },
];
const sectionRows = (rows: DefaultRow[], section: (typeof sections)[number]) =>
  rows.filter((row) => section.categories.includes(rowCategory(row)));

function CameraResult({
  result,
  busy,
  run,
}: {
  result: DefaultsCameraPlan;
  busy: boolean;
  run: Run;
}) {
  const [open, setOpen] = useState(false);
  const { camera, rows, error } = result;
  return (
    <details
      className="review-camera-accordion"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary tabIndex={0}>
        <span className="review-camera-title">
          Caméra <code>{camera.ip}</code>
          <small>{rows.length} réglages au total</small>
        </span>
        <span className="review-camera-counts">
          {error && (
            <span className="review-count errors">Contrôle à reprendre</span>
          )}
          {sections.map((section) => {
            const count = sectionRows(rows, section).length;
            return (
              count > 0 && (
                <span key={section.id} className={`review-count ${section.id}`}>
                  {count} {section.label.toLocaleLowerCase("fr")}
                </span>
              )
            );
          })}
          {!rows.length && !error && <span>Aucun réglage à afficher</span>}
        </span>
      </summary>
      {open && (
        <div className="review-camera-body">
          {error && <Alert kind="warning">{error}</Alert>}
          {sections.map((section) => {
            const entries = sectionRows(rows, section);
            if (!entries.length) return null;
            return (
              <details
                className={`review-result-group ${section.id}`}
                key={section.id}
              >
                <summary tabIndex={0}>
                  {section.label} <span>{entries.length}</span>
                </summary>
                <dl>
                  {entries.map((r) => (
                    <div
                      key={r.id}
                      className={`defaults-result-row ${r.state}`}
                    >
                      <dt>
                        {r.label}
                        <small>{rowStatus(r)}</small>
                      </dt>
                      <dd>
                        <div className="review-values">
                          {r.before !== undefined && (
                            <span>
                              <small>Avant</small>
                              {r.before || "Non renseigné"}
                            </span>
                          )}
                          <span>
                            <small>Valeur souhaitée</small>
                            {defaultValueLabel(r.value)}
                          </span>
                          {r.observed !== undefined && (
                            <span>
                              <small>Valeur relue</small>
                              {defaultValueLabel(r.observed)}
                            </span>
                          )}
                        </div>
                        {["errors", "manual", "unsupported"].includes(
                          section.id,
                        ) && <p className="review-reason">{r.message}</p>}
                        <details className="review-control-details">
                          <summary tabIndex={0}>Détails du contrôle</summary>
                          {r.code && <p>{issueLabels[r.code]}</p>}
                          {!["errors", "manual", "unsupported"].includes(
                            section.id,
                          ) && <p>{r.message}</p>}
                          {r.issues?.map((issue, i) => (
                            <p key={i}>
                              {issueLabels[issue.code]} : {issue.message}
                            </p>
                          ))}
                        </details>
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            );
          })}
          <Button
            disabled={busy}
            onClick={() =>
              void run("Ouverture de l’interface de la caméra", () =>
                window.sezaam.call("openWeb", { id: camera.id }),
              )
            }
          >
            <ExternalLink size={14} />
            Interface constructeur
          </Button>
        </div>
      )}
    </details>
  );
}

export function DefaultsResults({
  plan,
  report,
  busy,
  run,
}: {
  plan: DefaultsPlan;
  report: boolean;
  busy: boolean;
  run: Run;
}) {
  const cameras = [...plan.cameras].sort((a, b) =>
    a.camera.ip.localeCompare(b.camera.ip, undefined, { numeric: true }),
  );
  return (
    <>
      <p className="help-text review-scope">
        {report
          ? "Dépliez une caméra pour consulter son bilan. Les erreurs et les interventions manuelles apparaissent en premier."
          : "Dépliez une caméra pour consulter ses réglages. Les erreurs et les interventions manuelles apparaissent en premier. Le bouton Appliquer concerne les réglages compatibles de toutes les caméras de ce bilan, même repliées."}
      </p>
      <div
        className="review-camera-accordions"
        aria-label="Résultats par caméra, par IP croissante"
      >
        {cameras.map((result) => (
          <CameraResult
            key={result.camera.id}
            result={result}
            busy={busy}
            run={run}
          />
        ))}
        {!cameras.length && <p>Aucune caméra dans ce bilan.</p>}
      </div>
    </>
  );
}
