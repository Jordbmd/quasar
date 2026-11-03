import { displayDefaultValue as defaultValueLabel } from "./format";
import { t, getLanguage } from "../shared/i18n";
import React, { useEffect, useState } from "react";
import { RefreshCw, Download, ShieldCheck } from "lucide-react";
import { Button, Panel, Alert, Modal } from "./design-system/components";
import { auditFields, supportLabels } from "../shared/default-support";
import { defaultGroups, type DefaultsProgress } from "../shared/defaults";
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
        <strong>{report.name}</strong> {t("· version")} {report.revision} ·{" "}
        {new Date(report.startedAt).toLocaleString(getLanguage())}
        <br />
        {report.kind === "audit"
          ? t("Audit en lecture seule — aucune écriture")
          : t("Application du profil")}{" "}
        ·{" "}
        {report.status === "interrupted"
          ? t("Interrompu — état réel à relire")
          : report.status === "running"
            ? t("En cours")
            : t("Terminé")}
      </p>
      {report.journalWarning && (
        <Alert kind="warning">{t(report.journalWarning)}</Alert>
      )}
      <div className="profile-filters">
        <select
          aria-label={t("Filtrer le journal par caméra")}
          value={camera}
          onChange={(e) => setCamera(e.target.value)}
        >
          <option value="all">{t("Toutes les caméras")}</option>
          {report.cameras.map((c) => (
            <option key={c.camera.id} value={c.camera.id}>
              {c.camera.ip}
            </option>
          ))}
        </select>
        <select
          aria-label={t("Filtrer le journal par résultat")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">{t("Tous les résultats")}</option>
          <option value="failed">{t("Échecs et interruptions")}</option>
          <option value="unread">{t("Lecture / contrôle à reprendre")}</option>
          <option value="blocked">
            {t("Non pris en charge / non automatisés")}
          </option>
          <option value="verified">{t("Vérifiés et conformes")}</option>
        </select>
        <input
          aria-label={t("Rechercher dans le journal")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Rechercher un champ…")}
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
              `${t(r.label)} ${r.code || ""}`
                .toLowerCase()
                .includes(search.toLowerCase()),
          );
          return (
            <section key={c.camera.id} className="defaults-camera-result">
              <h3>
                {t("Caméra ·")} <code>{c.camera.ip}</code>
              </h3>
              {c.error && <Alert kind="warning">{t(c.error)}</Alert>}
              {!rows.length && <p>{t("Aucun champ pour ce filtre.")}</p>}
              <dl>
                {rows.map((r) => (
                  <div className={"defaults-result-row " + r.state} key={r.id}>
                    <dt>
                      {t(r.label)}
                      <small>{t(rowStatus(r))}</small>
                    </dt>
                    <dd>
                      <strong>
                        {t("Demandé :")} {defaultValueLabel(r.value)}
                      </strong>
                      {r.before !== undefined && (
                        <p>
                          {t("Avant :")} {r.before}
                        </p>
                      )}
                      {r.observed !== undefined && (
                        <p>
                          {t("Relu :")} {defaultValueLabel(r.observed)}
                        </p>
                      )}
                      <p>{t(r.message)}</p>
                      {r.code && (
                        <code className="profile-error-code">
                          {r.code} · {t(issueLabels[r.code])}
                        </code>
                      )}
                      {r.startedAt && (
                        <p>
                          {new Date(r.startedAt).toLocaleTimeString(
                            getLanguage(),
                          )}{" "}
                          →{" "}
                          {r.finishedAt
                            ? new Date(r.finishedAt).toLocaleTimeString(
                                getLanguage(),
                              )
                            : t("interruption / non terminé")}
                        </p>
                      )}
                      {r.method && (
                        <p>
                          {t("Action :")} {r.method} {t("· envoi")}{" "}
                          {r.sent === undefined
                            ? t("non confirmé")
                            : r.sent
                              ? t("effectué")
                              : t("non effectué")}{" "}
                          {t("· réponse")}{" "}
                          {r.acknowledged === undefined
                            ? t("non confirmée")
                            : r.acknowledged
                              ? t("reçue")
                              : t("non confirmée")}
                        </p>
                      )}
                      {r.issues?.map((i, index) => (
                        <p key={index}>
                          {i.stage === "send" ? "Envoi" : "Relecture"} :{" "}
                          {t(i.message)}
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
    void run(t("Audit des champs du profil"), async () => {
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
      `${t(f.label)} ${t(f.reason)} ${f.method}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="profile-insights">
      {error && <Alert kind="danger">{t(error)}</Alert>}
      {notice && (
        <Alert kind="info" onDismiss={() => setNotice("")}>
          {t(notice)}
        </Alert>
      )}
      {view === "compatibility" ? (
        <>
          <Panel className="panel profile-audit-intro">
            <div>
              <h3>
                <ShieldCheck size={20} />
                {t("Compatibilité par fonction")}
              </h3>
              <p>
                {t("Les")} {fields.length}{" "}
                {t(
                  "champs sont examinés, même ceux exclus du profil. Aucun modèle n’est imposé. Une option annoncée en lecture ne vaut pas validation d’écriture.",
                )}
              </p>
            </div>
            <div className="defaults-actions">
              <Button
                disabled={busy || dirty || !selected}
                onClick={() => inspect([selected])}
              >
                {t("Vérifier cette caméra")}
              </Button>
              <Button
                disabled={busy || dirty || !cameras.length}
                onClick={() => inspect(cameras.map((c) => c.id))}
              >
                {t("Vérifier toutes les caméras (")}
                {cameras.length})
              </Button>
            </div>
            {dirty && (
              <p>{t("Enregistre le profil avant de vérifier ses valeurs.")}</p>
            )}
            {!cameras.length && (
              <p>
                {t(
                  "Connecte les caméras pour compléter cet audit documentaire par une lecture de leurs capacités.",
                )}
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
                {fields.filter((f) => f.kind === key).length} · {t(label)}
              </Button>
            ))}
          </div>
          <div className="profile-filters">
            <input
              aria-label={t("Rechercher dans la compatibilité")}
              placeholder={t("Rechercher un réglage…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label={t("Catégorie de compatibilité")}
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="all">{t("Toutes les catégories")}</option>
              {defaultGroups.map((g) => (
                <option key={g}>{t(g)}</option>
              ))}
            </select>
            {audit && (
              <select
                aria-label={t("Caméra de l’audit")}
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
              {t("Dernière lecture :")}{" "}
              {new Date(audit.updatedAt).toLocaleString(getLanguage())} ·{" "}
              <Button onClick={() => setOpened(audit)}>
                {t("Ouvrir le rapport")}
              </Button>
            </p>
          )}
          {current?.error && <Alert kind="warning">{current.error}</Alert>}
          <Panel className="panel profile-support-table">
            {selectedRows.map((f) => (
              <article key={f.id}>
                <div>
                  <h4>{t(f.label)}</h4>
                  <small>{t(f.group)}</small>
                  <span
                    className={
                      "default-support " +
                      (f.kind === "implemented" ? "automatic" : "")
                    }
                  >
                    {t(supportLabels[f.kind])}
                  </span>
                </div>
                <div>
                  <strong>{t(f.method)}</strong>
                  <p>{t(f.reason)}</p>
                  {audit && (
                    <p className="profile-observation">{f.observation}</p>
                  )}
                </div>
              </article>
            ))}
            {!selectedRows.length && <p>{t("Aucun champ pour ce filtre.")}</p>}
          </Panel>
        </>
      ) : (
        <>
          <div className="defaults-heading">
            <div>
              <h3>{t("Journal des profils")}</h3>
              <p>
                {t(
                  "Audits et applications conservés sur ce Mac, y compris après redémarrage. Les 50 derniers rapports sont conservés.",
                )}
              </p>
            </div>
            <Button disabled={busy} onClick={() => void load()}>
              <RefreshCw size={16} />
              {t("Actualiser le journal")}
            </Button>
          </div>
          {!history.length && !error && (
            <Panel className="panel profile-audit-intro">
              <h3>{t("Aucun rapport enregistré")}</h3>
              <p>
                {t(
                  "Une vérification de compatibilité ou une application du profil crée un rapport. Les erreurs d’écriture sont séparées des fonctions non intégrées.",
                )}
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
                      ? t("Audit de compatibilité")
                      : "Application"}{" "}
                    · {h.name}
                  </strong>
                  <small>
                    {new Date(h.startedAt).toLocaleString(getLanguage())} ·{" "}
                    {h.cameras} {t("caméra(s) · version")} {h.revision}
                  </small>
                </span>
                <span>
                  {h.status === "interrupted"
                    ? "Interrompu"
                    : h.status === "running"
                      ? t("En cours")
                      : h.failed
                        ? t("{0} échec(s)", h.failed)
                        : t("Terminé")}
                  <small>
                    {h.verified} {t("vérifiés ·")} {h.unread ?? 0}{" "}
                    {t("non vérifiés ·")} {h.blocked}{" "}
                    {t("non pris en charge ·")} {h.manual ?? 0}{" "}
                    {t("non automatisés")}
                  </small>
                </span>
              </Button>
            ))}
          </div>
        </>
      )}
      <Modal
        open={!!opened}
        title={t("Journal du profil")}
        onClose={() => setOpened(undefined)}
        footer={
          <>
            <Button onClick={() => setOpened(undefined)}>{t("Fermer")}</Button>
            <Button
              disabled={busy || !opened}
              onClick={() =>
                void run(t("Export du journal"), async () => {
                  const result = await window.sezaam.call("exportDefaultsRun", {
                    id: opened!.id,
                  });
                  setNotice(result);
                })
              }
            >
              <Download size={16} />
              {t("Exporter le rapport JSON")}
            </Button>
          </>
        }
      >
        {opened && <RunDetails key={opened.id} report={opened} />}
      </Modal>
    </div>
  );
}
