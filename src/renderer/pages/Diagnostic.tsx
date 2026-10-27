import React from "react";
import { Activity, Camera as CameraIcon, Copy, Download } from "lucide-react";
import type { AppState, DiagnosticReport } from "../../shared/types";
import { Field, type Run } from "../ui";
import { Button, Panel } from "../design-system/components";
import { DiagnosticResults, EventLog } from "../design-system/camera";
export function Diagnostic({
  state,
  selected,
  onSelect,
  report,
  busy,
  run,
  onNotice,
  onConnect,
  onStop,
}: {
  state?: AppState;
  selected: string;
  onSelect: (id: string) => void;
  report?: DiagnosticReport;
  busy: boolean;
  run: Run;
  onNotice: (s: string) => void;
  onConnect: () => void;
  onStop: () => Promise<void>;
}) {
  const reports = state?.reports ?? [];
  const accessible = reports.filter((r) =>
    r.checks.some((c) => c.key === "network" && c.state === "passed"),
  ).length;
  const errors = reports.filter((r) =>
    r.checks.some((c) => c.state === "failed"),
  ).length;
  const labels = {
    passed: "Réussi",
    failed: "Échec",
    unsupported: "Non pris en charge",
    untested: "Non testé",
  };
  return (
    <div className="diagnostic-page">
      <div className="metrics">
        {[
          [
            "Caméras détectées",
            String(state?.cameras.length ?? 0),
            "Dans cette session",
          ],
          ["Accessibles", String(accessible), "Connexion TCP testée"],
          ["Avec erreurs", String(errors), "Derniers tests par caméra"],
          [
            "Dernier diagnostic",
            reports.length
              ? new Date(reports.at(-1)!.at).toLocaleTimeString()
              : "Non effectué",
            reports.length
              ? new Date(reports.at(-1)!.at).toLocaleDateString()
              : "Aucun test automatique",
          ],
        ].map(([title, num, sub]) => (
          <Panel className="panel metric" key={title}>
            <span>{title}</span>
            <strong>{num}</strong>
            <small>{sub}</small>
          </Panel>
        ))}
      </div>
      <Panel className="panel diagnostic-tests">
        <div className="section-title">
          <div>
            <h2>Diagnostic par caméra</h2>
            <p>Tests à la demande, sans modifier les réglages de l’appareil.</p>
          </div>
          <Button
            className="primary"
            disabled={busy || !selected}
            onClick={() =>
              void run("Diagnostic de la caméra", async () => {
                await onStop();
                return window.sezaam.call("diagnose", { id: selected });
              })
            }
          >
            <Activity size={17} />
            Lancer le diagnostic
          </Button>
        </div>
        <div className="diagnostic-select">
          <Field label="Caméra à tester">
            <select
              disabled={busy}
              value={selected}
              onChange={(e) => onSelect(e.target.value)}
            >
              <option value="">Sélectionner une caméra</option>
              {state?.cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.model || "Caméra"} · {c.ip}
                </option>
              ))}
            </select>
          </Field>
          <Button
            className="secondary"
            disabled={busy || !selected}
            onClick={onConnect}
          >
            <CameraIcon size={16} />
            Ouvrir la fiche caméra
          </Button>
        </div>
        <DiagnosticResults report={report} />
      </Panel>
      <Panel className="panel logs">
        <div className="section-title">
          <div>
            <h2>Journal des événements</h2>
            <p>500 derniers événements · secrets masqués</p>
          </div>
          <div className="button-group">
            <Button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run("Copie du diagnostic", async () => {
                  await window.sezaam.call("copyLogs", undefined);
                  onNotice("Diagnostic copié.");
                })
              }
            >
              <Copy size={15} />
              Copier
            </Button>
            <Button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run("Export du diagnostic", async () => {
                  onNotice(await window.sezaam.call("exportLogs", undefined));
                })
              }
            >
              <Download size={15} />
              Exporter
            </Button>
          </div>
        </div>
        <EventLog entries={state?.logs ?? []} />
      </Panel>
    </div>
  );
}
