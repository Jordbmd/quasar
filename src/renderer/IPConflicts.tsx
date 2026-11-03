import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Network } from "lucide-react";
import type { AddressPlan, AddressProgress } from "../shared/addressing";
import { Alert, Badge, Button, Modal } from "./design-system/components";
import { BatchProgress } from "./BatchFeedback";
import type { Run } from "./ui";

export function IPConflicts({
  open,
  onClose,
  busy,
  run,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  run: Run;
  onApplied: (plan?: AddressPlan) => void;
}) {
  const started = useRef(false);
  const [plan, setPlan] = useState<AddressPlan>();
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const [progress, setProgress] = useState<AddressProgress>();
  const analyse = useCallback(
    () =>
      void run("Analyse des conflits IP", async () => {
        setError("");
        setPhase("Recherche des doublons et des IP libres");
        setPlan(undefined);
        setFinished(false);
        setProgress(undefined);
        try {
          setPlan(await window.sezaam.call("previewIPConflicts", undefined));
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setPhase("");
        }
      }),
    [run],
  );
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      analyse();
    }
  }, [analyse]);
  useEffect(
    () =>
      window.sezaam.onAddressProgress?.((update) => {
        if (update.planId === plan?.id) setProgress(update);
      }),
    [plan?.id],
  );
  const moves = plan?.steps?.filter((s) => s.kind !== "verify").length ?? 0;
  const ready = plan?.rows.some((r) => r.state === "ready") ?? false;
  const unresolved =
    plan?.rows.filter((r) => !["verified", "unchanged"].includes(r.state))
      .length ?? 0;
  const groups = [...new Set(plan?.rows.map((r) => r.from) ?? [])];
  const apply = () =>
    void run("Résolution des conflits IP", async () => {
      if (!plan) return;
      setError("");
      setPhase("Résolution et vérification des IP");
      setProgress(undefined);
      try {
        const result = await window.sezaam.call("applyAddresses", {
          planId: plan.id,
        });
        setPlan(result);
        setFinished(true);
        onApplied(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        // A plan is consumed even after cancellation. Prepare a fresh read-only plan.
        setPlan(undefined);
      } finally {
        setPhase("");
      }
    });
  return (
    <Modal
      open={open}
      title={
        finished
          ? "Bilan de résolution des conflits"
          : "Résoudre les conflits IP"
      }
      busy={busy || !!phase}
      onClose={() => {
        if (!busy && !phase) onClose();
      }}
      status={
        <>
          {phase && (
            <BatchProgress title={phase} progress={progress} unit="étapes" />
          )}
          {error && <Alert kind="danger">{error}</Alert>}
          {finished && (
            <Alert kind={unresolved || plan?.warning ? "warning" : "success"}>
              <strong className="ip-conflict-result-title">
                {unresolved
                  ? "Résolution terminée — points à vérifier."
                  : "Les conflits détectés sont résolus."}
              </strong>
              <span>
                {unresolved
                  ? `${unresolved} caméra(s) restent à vérifier. Le détail ci-dessous indique les changements effectués.`
                  : "Chaque caméra concernée répond avec une adresse unique et une identité vérifiée."}
              </span>
            </Alert>
          )}
          {plan?.warning && <Alert kind="warning">{plan.warning}</Alert>}
        </>
      }
      footer={
        <>
          {!phase && (
            <Button disabled={busy} onClick={analyse}>
              {finished ? "Vérifier à nouveau" : "Relancer l’analyse"}
            </Button>
          )}
          {!finished && ready && (
            <Button
              variant="primary"
              disabled={busy || !!phase}
              onClick={apply}
            >
              Résoudre les conflits
            </Button>
          )}
          <Button disabled={busy || !!phase} onClick={onClose}>
            {finished ? "Fermer le bilan" : "Fermer"}
          </Button>
        </>
      }
    >
      <div className="ip-conflicts">
        {!finished && (
          <p>
            Quasar conserve une caméra à chaque IP partagée et attribue des IP
            libres aux autres. Les caméras sans conflit gardent leur adresse.
          </p>
        )}
        {plan && !plan.rows.length && (
          <div className="ip-conflicts-empty">
            <CheckCircle2 aria-hidden="true" />
            <strong>Aucun conflit IP détecté</strong>
            <span>Les caméras détectées ont des adresses distinctes.</span>
          </div>
        )}
        {plan && !finished && !!plan.rows.length && (
          <p className="help-text">
            {groups.length} IP partagée(s) · {moves} changement(s) proposé(s).
            Aucun débranchement pour les caméras identifiées ci-dessous.
          </p>
        )}
        {groups.map((ip) => (
          <section
            className="ip-conflict-group"
            key={ip}
            aria-label={`Conflit ${ip}`}
          >
            <h3>
              <Network size={18} aria-hidden="true" />
              IP partagée · {ip}
            </h3>
            {plan!.rows
              .filter((r) => r.from === ip)
              .map((row) => (
                <article className="ip-conflict-camera" key={row.id}>
                  <div className="ip-conflict-identity">
                    <strong>{row.name}</strong>
                    <small>{row.identity}</small>
                  </div>
                  <div className="ip-conflict-route">
                    <code>{row.from}</code>
                    {row.from !== row.to ? (
                      <>
                        <ArrowRight size={16} aria-hidden="true" />
                        <code>{row.to}</code>
                      </>
                    ) : (
                      <span>IP conservée</span>
                    )}
                  </div>
                  <Badge
                    kind={
                      row.state === "verified"
                        ? "success"
                        : row.state === "failed"
                          ? "danger"
                          : ["blocked", "skipped"].includes(row.state)
                            ? "warning"
                            : "neutral"
                    }
                  >
                    {row.state === "verified"
                      ? "Vérifiée"
                      : row.state === "blocked"
                        ? "À vérifier"
                        : row.state === "failed"
                          ? "Non confirmé"
                          : row.state === "skipped"
                            ? "Non exécutée"
                            : row.from === row.to
                              ? "Sans changement"
                              : "Nouvelle IP"}
                  </Badge>
                  <p>{row.message}</p>
                  {row.lastVerifiedIP && (
                    <small>Dernière IP vérifiée : {row.lastVerifiedIP}</small>
                  )}
                </article>
              ))}
          </section>
        ))}
      </div>
    </Modal>
  );
}
