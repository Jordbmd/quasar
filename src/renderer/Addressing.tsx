import { t } from "../shared/i18n";
import React, { useEffect, useState } from "react";
import type {
  AddressPlan,
  AddressProgress,
  LockerAssignment,
} from "../shared/addressing";
import type { Camera } from "../shared/types";
import { Button, Modal, Alert, Field } from "./design-system/components";
import { BatchProgress, AddressOutcome } from "./BatchFeedback";
import type { Run } from "./ui";

export function Addressing({
  open,
  onClose,
  busy,
  run,
  cameras,
  onApplied,
  assignments,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  run: Run;
  cameras: Camera[];
  onApplied: (plan?: AddressPlan) => void;
  assignments?: LockerAssignment[];
}) {
  const [start, setStart] = useState("1");
  const [plan, setPlan] = useState<AddressPlan>();
  const [resumeAssignments, setResumeAssignments] =
    useState<LockerAssignment[]>();
  const [error, setError] = useState("");
  const [isolating, setIsolating] = useState("");
  const [isolated, setIsolated] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState<AddressProgress>();
  const [finished, setFinished] = useState(false);
  useEffect(
    () =>
      window.sezaam.onAddressProgress?.((update) => {
        if (update.planId === plan?.id) setProgress(update);
      }),
    [plan?.id],
  );
  const [applied, setApplied] = useState(false);
  const execute = (label: string, work: () => Promise<void>) =>
    void run(label, async () => {
      setError("");
      setPhase(label);
      setProgress(undefined);
      setFinished(false);
      try {
        await work();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPhase("");
      }
    });
  const selected = cameras.find((c) => c.id === isolating);
  const ready = plan?.rows.filter((r) => r.state === "ready").length ?? 0;
  return (
    <Modal
      open={open}
      title={
        finished
          ? t("Bilan d’attribution des IP")
          : t("Attribuer les IP par casier")
      }
      busy={busy}
      status={
        <>
          {phase && (
            <BatchProgress
              key={phase}
              title={phase}
              progress={progress}
              unit="étapes"
            />
          )}
          {finished && plan && <AddressOutcome plan={plan} />}
          {error && <Alert kind="danger">{t(error)}</Alert>}
        </>
      }
      footer={
        <Button disabled={busy} onClick={onClose}>
          {finished ? t("Fermer le bilan") : t("Fermer")}
        </Button>
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="addressing-review">
        <p>
          {t(
            "Casier 1 → 192.168.1.11, casier 2 → 192.168.1.12. Les caméras sont",
          )}{" "}
          {assignments
            ? t("associées aux numéros importés de la Box. L’IHM 0 est exclue.")
            : t(
                "classées par IP actuelle puis par identité. Vérifiez l’ordre avant d’appliquer.",
              )}
        </p>
        <p>
          {t(
            "Les conflits sont vérifiés pendant cette préparation. Quand le protocole constructeur permet de cibler chaque caméra par son identifiant, l’attribution les résout sans débranchement. Les adresses sont libérées dans le bon ordre ; une IP temporaire est proposée si nécessaire, puis remplacée par l’adresse du casier.",
          )}
        </p>
        {!assignments && (
          <Field label={t("Premier casier")}>
            <input
              type="number"
              min="1"
              max="244"
              value={start}
              disabled={busy}
              onChange={(e) => {
                setStart(e.target.value);
                setResumeAssignments(undefined);
                setPlan(undefined);
                setIsolating("");
                setIsolated(false);
                setApplied(false);
                setFinished(false);
              }}
            />
          </Field>
        )}
        <Button
          disabled={busy || !cameras.length || !start}
          onClick={() =>
            execute(t("Vérification de la plage d’adresses"), async () => {
              // A temporary IP must not reorder the intended locker assignment
              // when the user prepares the remainder of an interrupted run.
              const retainedAssignments = assignments ?? resumeAssignments;
              setPlan(undefined);
              setIsolating("");
              setIsolated(false);
              setApplied(false);
              setFinished(false);
              setPlan(
                await window.sezaam.call("previewAddresses", {
                  start: Number(start),
                  ...(retainedAssignments
                    ? { assignments: retainedAssignments }
                    : {}),
                }),
              );
            })
          }
        >
          {t("Vérifier les adresses")}
        </Button>
        {plan && (
          <>
            <div className="addressing-table">
              <table>
                <caption>
                  {t("Plan d’adressage — masque 255.255.255.0")}
                </caption>
                <thead>
                  <tr>
                    <th>{t("Caméra")}</th>
                    <th>{t("Casier")}</th>
                    <th>{t("Adresse actuelle")}</th>
                    <th>{t("Nouvelle adresse")}</th>
                    <th>{t("Résultat")}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.name}
                        <small>{row.identity}</small>
                      </td>
                      <td>{row.locker}</td>
                      <td>{row.from}</td>
                      <td>
                        {row.to}
                        {row.temporaryIP && (
                          <small>
                            {t("Via")} {row.temporaryIP} {t("(temporaire)")}
                          </small>
                        )}
                      </td>
                      <td>
                        {row.message}
                        {row.lastVerifiedIP && (
                          <small>
                            {t("Dernière IP vérifiée :")} {row.lastVerifiedIP}
                          </small>
                        )}
                        {row.state === "blocked" &&
                          row.resolution === "serial" && (
                            <p className="help-text">
                              {t("Ciblage sans débranchement confirmé.")}{" "}
                              {row.from === row.to
                                ? t(
                                    "Cette IP est encore partagée : déplacez d’abord l’autre caméra vers une IP libre, puis vérifiez à nouveau les adresses.",
                                  )
                                : t(
                                    "Choisissez une adresse libre, puis vérifiez à nouveau les adresses.",
                                  )}
                            </p>
                          )}
                        {row.state === "blocked" &&
                          row.resolution !== "serial" &&
                          cameras.find((c) => c.id === row.id)?.ambiguous && (
                            <Button
                              disabled={busy}
                              onClick={() => {
                                setIsolating(row.id);
                                setIsolated(false);
                              }}
                            >
                              {t("Résolution par isolation")}
                            </Button>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.steps?.length ? (
              <details>
                <summary>
                  {t("Ordre des opérations ·")} {plan.steps.length}{" "}
                  {t("étapes")}
                </summary>
                <ol>
                  {plan.steps.map((step, index) => (
                    <li key={index}>
                      {step.kind === "temporary"
                        ? "IP temporaire"
                        : step.kind === "verify"
                          ? t("Vérification sans changement")
                          : "IP finale"}
                      {" · "}
                      {step.from} → {step.to}
                      {step.state &&
                        ` · ${step.state === "verified" ? t("Vérifiée") : step.state === "failed" ? t("À vérifier") : t("Non exécutée")}`}
                      {step.message && <small>{step.message}</small>}
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
            {!applied && (
              <>
                <p>
                  {ready}{" "}
                  {t(
                    "caméra(s) à modifier. Les lignes bloquées seront exclues. Les changements seront vérifiés un par un ; le lot s’arrêtera si un résultat reste incertain. Dans ce cas, les IP temporaires déjà attribuées sont conservées et indiquées dans le bilan. Une nouvelle vérification prépare la suite.",
                  )}
                </p>
                <Button
                  variant="primary"
                  disabled={busy || !ready}
                  onClick={() =>
                    execute(
                      t(
                        "Attribution et vérification des IP — cela peut prendre plusieurs minutes",
                      ),
                      async () => {
                        const reviewed = plan;
                        if (reviewed.steps)
                          setResumeAssignments(
                            reviewed.rows.flatMap((row) =>
                              row.locker === undefined
                                ? []
                                : [
                                    {
                                      id: row.id,
                                      locker: row.locker,
                                    },
                                  ],
                            ),
                          );
                        setApplied(true);
                        const result = await window.sezaam.call(
                          "applyAddresses",
                          { planId: reviewed.id },
                        );
                        setPlan(result);
                        setFinished(true);
                        onApplied(result);
                      },
                    )
                  }
                >
                  {t("Attribuer les IP à")} {ready} {t("caméra(s)")}
                </Button>
              </>
            )}
          </>
        )}
        {cameras.some((c) => c.ambiguous) && !plan && (
          <Alert kind="warning">
            {t(
              "Des caméras partagent la même IP. « Vérifier les adresses » recherche automatiquement une méthode de résolution sans débranchement.",
            )}
          </Alert>
        )}
        {selected && (
          <section className="addressing-isolation">
            <h3>
              {t("Autre méthode : isoler la caméra à")} {selected.ip}
            </h3>
            <p>
              {t(
                "Gardez uniquement la caméra choisie branchée au switch. Identité attendue :",
              )}{" "}
              <code>{selected.mac || selected.endpoint}</code>
              {t(". La vérification ne change encore aucune adresse.")}
            </p>
            <label>
              <input
                type="checkbox"
                checked={isolated}
                disabled={busy}
                onChange={(e) => setIsolated(e.target.checked)}
              />{" "}
              {t("J’ai laissé uniquement cette caméra branchée.")}
            </label>
            <Button
              disabled={busy || !isolated}
              onClick={() =>
                execute(t("Vérification de la caméra isolée"), async () => {
                  await window.sezaam.call("resolveIPConflict", {
                    id: selected.id,
                    isolated: true,
                  });
                  setIsolating("");
                  setIsolated(false);
                  setPlan(undefined);
                  setApplied(false);
                  setFinished(false);
                  onApplied();
                })
              }
            >
              {t("Vérifier la caméra isolée")}
            </Button>
            <p>
              {t(
                "Après confirmation, vérifiez la plage et attribuez une nouvelle IP avant de rebrancher la caméra suivante. Aucun ciblage par MAC non vérifié n’est envoyé.",
              )}
            </p>
          </section>
        )}
      </div>
    </Modal>
  );
}
