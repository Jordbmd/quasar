import React, { useEffect, useState } from "react";
import { RefreshCw, Download, ShieldCheck } from "lucide-react";
import { Button, Panel, Alert, Modal } from "./design-system/components";
import { auditFields, supportLabels } from "../shared/default-support";
import {
  defaultGroups,
  defaultValueLabel,
  type DefaultsProgress,
} from "../shared/defaults";
import {
  issueLabels,
  rowStatus,
  rowCategory,
  type ProfileRun,
  type ProfileRunSummary,
} from "../shared/profile-journal";
import type { Camera } from "../shared/types";
import type { Run } from "./ui";
function RunDetails({ report }: { report: ProfileRun }) {
  const [camera, setCamera] = useState("all"),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  return (
    <div className="profile-run-details">
      <p>
        <strong>{report.name}</strong> · version {report.revision} ·{" "}
        {new Date(report.startedAt).toLocaleString()}
        <br />
        {report.kind === "audit"
          ? "Audit en lecture seule — aucune écriture"
          : "Application du profil"}{" "}
        ·{" "}
        {report.status === "interrupted"
          ? "Interrompu — état réel à relire"
          : report.status === "running"
            ? "En cours"
            : "Terminé"}
      </p>
      {report.journalWarning && (
        <Alert kind="warning">{report.journalWarning}</Alert>
      )}
      <div className="profile-filters">
        <select
          aria-label="Filtrer le journal par caméra"
          value={camera}
          onChange={(e) => setCamera(e.target.value)}
        >
          <option value="all">Toutes les caméras</option>
          {report.cameras.map((c) => (
            <option key={c.camera.id} value={c.camera.id}>
              {c.camera.ip}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrer le journal par résultat"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Tous les résultats</option>
          <option value="failed">Échecs et interruptions</option>
          <option value="unread">Lecture / contrôle à reprendre</option>
          <option value="blocked">Non pris en charge / non automatisés</option>
          <option value="verified">Vérifiés et conformes</option>
        </select>
        <input
          aria-label="Rechercher dans le journal"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un champ…"
        />
      </div>
      {report.cameras
        .filter((c) => camera === "all" || c.camera.id === camera)
        .map((c) => {
          const rows = c.rows.filter(
            (r) =>
              (filter === "all" ||
                (filter === "failed"
                  ? ["failed", "skipped"]
                  : filter === "blocked"
                    ? ["unavailable", "manual"]
                    : filter === "unread"
                      ? ["unread"]
                      : ["verified", "same"]
                ).includes(rowCategory(r))) &&
              `${r.label} ${r.code || ""}`
                .toLowerCase()
                .includes(search.toLowerCase()),
          );
          return (
            <section key={c.camera.id} className="defaults-camera-result">
              <h3>
                Caméra · <code>{c.camera.ip}</code>
              </h3>
              {c.error && <Alert kind="warning">{c.error}</Alert>}
              {!rows.length && <p>Aucun champ pour ce filtre.</p>}
              <dl>
                {rows.map((r) => (
                  <div className={"defaults-result-row " + r.state} key={r.id}>
                    <dt>
                      {r.label}
                      <small>{rowStatus(r)}</small>
                    </dt>
                    <dd>
                      <strong>Demandé : {defaultValueLabel(r.value)}</strong>
                      {r.before !== undefined && <p>Avant : {r.before}</p>}
                      {r.observed !== undefined && (
                        <p>Relu : {defaultValueLabel(r.observed)}</p>
                      )}
                      <p>{r.message}</p>
                      {r.code && (
                        <code className="profile-error-code">
                          {r.code} · {issueLabels[r.code]}
                        </code>
                      )}
                      {r.startedAt && (
                        <p>
                          {new Date(r.startedAt).toLocaleTimeString()} →{" "}
                          {r.finishedAt
                            ? new Date(r.finishedAt).toLocaleTimeString()
                            : "interruption / non terminé"}
                        </p>
                      )}
                      {r.method && (
                        <p>
                          Action : {r.method} · envoi{" "}
                          {r.sent === undefined
                            ? "non confirmé"
                            : r.sent
                              ? "effectué"
                              : "non effectué"}{" "}
                          · réponse{" "}
                          {r.acknowledged === undefined
                            ? "non confirmée"
                            : r.acknowledged
                              ? "reçue"
                              : "non confirmée"}
                        </p>
                      )}
                      {r.issues?.map((i, index) => (
                        <p key={index}>
                          {i.stage === "send" ? "Envoi" : "Relecture"} :{" "}
                          {i.message}
                        </p>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
    </div>
  );
}
export function ProfileInsights({
  view,
  cameras,
  selected,
  busy,
  dirty,
  run,
}: {
  view: "compatibility" | "journal";
  cameras: Camera[];
  selected: string;
  busy: boolean;
  dirty: boolean;
  run: Run;
}) {
  const [history, setHistory] = useState<ProfileRunSummary[]>([]),
    [audit, setAudit] = useState<ProfileRun>(),
    [opened, setOpened] = useState<ProfileRun>();
  const [camera, setCamera] = useState(""),
    [search, setSearch] = useState(""),
    [kind, setKind] = useState("all"),
    [group, setGroup] = useState("all"),
    [error, setError] = useState(""),
    [progress, setProgress] = useState<DefaultsProgress>(),
    [notice, setNotice] = useState("");
  const load = async () => {
    try {
      setError("");
      const entries = await window.sezaam.call("listDefaultsRuns", undefined);
      setHistory(entries);
      return entries;
    } catch (e) {
      setError((e as Error).message);
      return [];
    }
  };
  useEffect(() => {
    void load();
  }, [view]);
  useEffect(() => window.sezaam.onDefaultsProgress?.(setProgress), []);
  const inspect = (ids: string[]) =>
    void run("Audit des champs du profil", async () => {
      setError("");
      try {
        const report = await window.sezaam.call("auditDefaults", { ids });
        setAudit(report);
        setCamera(report.cameras[0]?.camera.id || "");
        await load();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  const open = async (id: string) => {
    setError("");
    try {
      const report = await window.sezaam.call("getDefaultsRun", { id });
      setOpened(report);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const fields =
    audit?.audit?.find((c) => c.cameraId === camera)?.fields ?? auditFields();
  const current = audit?.cameras.find((c) => c.camera.id === camera);
  const selectedRows = fields.filter(
    (f) =>
      (kind === "all" || f.kind === kind) &&
      (group === "all" || f.group === group) &&
      `${f.label} ${f.reason} ${f.method}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="profile-insights">
      {error && <Alert kind="danger">{error}</Alert>}
      {notice && (
        <Alert kind="info" onDismiss={() => setNotice("")}>
          {notice}
        </Alert>
      )}
      {view === "compatibility" ? (
        <>
          <Panel className="panel profile-audit-intro">
            <div>
              <h3>
                <ShieldCheck size={20} />
                Compatibilité par fonction
              </h3>
              <p>
                Les {fields.length} champs sont examinés, même ceux exclus du
                profil. Aucun modèle n’est imposé. Une option annoncée en
                lecture ne vaut pas validation d’écriture.
              </p>
            </div>
            <div className="defaults-actions">
              <Button
                disabled={busy || dirty || !selected}
                onClick={() => inspect([selected])}
              >
                Vérifier cette caméra
              </Button>
              <Button
                disabled={busy || dirty || !cameras.length}
                onClick={() => inspect(cameras.map((c) => c.id))}
              >
                Vérifier toutes les caméras ({cameras.length})
              </Button>
            </div>
            {dirty && (
              <p>Enregistre le profil avant de vérifier ses valeurs.</p>
            )}
            {!cameras.length && (
              <p>
                Connecte les caméras pour compléter cet audit documentaire par
                une lecture de leurs capacités.
              </p>
            )}
            {busy && progress && (
              <p role="status">
                {progress.stage} · {progress.camera} · {progress.completed}/
                {progress.total}
              </p>
            )}
          </Panel>
          <div className="profile-support-counts">
            {Object.entries(supportLabels).map(([key, label]) => (
              <Button
                key={key}
                aria-pressed={kind === key}
                onClick={() => setKind(kind === key ? "all" : key)}
              >
                {fields.filter((f) => f.kind === key).length} · {label}
              </Button>
            ))}
          </div>
          <div className="profile-filters">
            <input
              aria-label="Rechercher dans la compatibilité"
              placeholder="Rechercher un réglage…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Catégorie de compatibilité"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="all">Toutes les catégories</option>
              {defaultGroups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
            {audit && (
              <select
                aria-label="Caméra de l’audit"
                value={camera}
                onChange={(e) => setCamera(e.target.value)}
              >
                {audit.cameras.map((c) => (
                  <option value={c.camera.id} key={c.camera.id}>
                    {c.camera.ip}
                  </option>
                ))}
              </select>
            )}
          </div>
          {audit && (
            <p>
              Dernière lecture : {new Date(audit.updatedAt).toLocaleString()} ·{" "}
              <Button onClick={() => setOpened(audit)}>
                Ouvrir le rapport
              </Button>
            </p>
          )}
          {current?.error && <Alert kind="warning">{current.error}</Alert>}
          <Panel className="panel profile-support-table">
            {selectedRows.map((f) => (
              <article key={f.id}>
                <div>
                  <h4>{f.label}</h4>
                  <small>{f.group}</small>
                  <span
                    className={
                      "default-support " +
                      (f.kind === "implemented" ? "automatic" : "")
                    }
                  >
                    {supportLabels[f.kind]}
                  </span>
                </div>
                <div>
                  <strong>{f.method}</strong>
                  <p>{f.reason}</p>
                  {audit && (
                    <p className="profile-observation">{f.observation}</p>
                  )}
                </div>
              </article>
            ))}
            {!selectedRows.length && <p>Aucun champ pour ce filtre.</p>}
          </Panel>
        </>
      ) : (
        <>
          <div className="defaults-heading">
            <div>
              <h3>Journal des profils</h3>
              <p>
                Audits et applications conservés sur ce Mac, y compris après
                redémarrage. Les 50 derniers rapports sont conservés.
              </p>
            </div>
            <Button disabled={busy} onClick={() => void load()}>
              <RefreshCw size={16} />
              Actualiser le journal
            </Button>
          </div>
          {!history.length && !error && (
            <Panel className="panel profile-audit-intro">
              <h3>Aucun rapport enregistré</h3>
              <p>
                Une vérification de compatibilité ou une application du profil
                crée un rapport. Les erreurs d’écriture sont séparées des
                fonctions non intégrées.
              </p>
            </Panel>
          )}
          <div className="profile-history">
            {history.map((h) => (
              <Button
                key={h.id}
                disabled={busy}
                onClick={() => void open(h.id)}
              >
                <span>
                  <strong>
                    {h.kind === "audit"
                      ? "Audit de compatibilité"
                      : "Application"}{" "}
                    · {h.name}
                  </strong>
                  <small>
                    {new Date(h.startedAt).toLocaleString()} · {h.cameras}{" "}
                    caméra(s) · version {h.revision}
                  </small>
                </span>
                <span>
                  {h.status === "interrupted"
                    ? "Interrompu"
                    : h.status === "running"
                      ? "En cours"
                      : h.failed
                        ? `${h.failed} échec(s)`
                        : "Terminé"}
                  <small>
                    {h.verified} vérifiés · {h.unread ?? 0} non vérifiés ·{" "}
                    {h.blocked} non pris en charge · {h.manual ?? 0} non
                    automatisés
                  </small>
                </span>
              </Button>
            ))}
          </div>
        </>
      )}
      <Modal
        open={!!opened}
        title="Journal du profil"
        onClose={() => setOpened(undefined)}
        footer={
          <>
            <Button onClick={() => setOpened(undefined)}>Fermer</Button>
            <Button
              disabled={busy || !opened}
              onClick={() =>
                void run("Export du journal", async () => {
                  const result = await window.sezaam.call("exportDefaultsRun", {
                    id: opened!.id,
                  });
                  setNotice(result);
                })
              }
            >
              <Download size={16} />
              Exporter le rapport JSON
            </Button>
          </>
        }
      >
        {opened && <RunDetails key={opened.id} report={opened} />}
      </Modal>
    </div>
  );
}
