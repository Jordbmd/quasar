import React, { useEffect, useState } from "react";
import type { Camera } from "../shared/types";
import {
  resetConfirmation,
  type FactoryResetPlan,
} from "../shared/factory-reset";
import { Button, Modal, Alert, Field } from "./design-system/components";
import type { Run } from "./ui";
const labels = {
  ready: "Prête",
  blocked: "Exclue",
  sending: "Envoi…",
  accepted: "Commande acceptée",
  uncertain: "À contrôler",
  failed: "Non envoyée",
  skipped: "Non envoyée",
};
export function FactoryResetDialog({
  cameras,
  busy,
  run,
  onClose,
  onApplied,
}: {
  cameras: Camera[];
  busy: boolean;
  run: Run;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [plan, setPlan] = useState<FactoryResetPlan>();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  useEffect(
    () =>
      window.sezaam.onFactoryResetProgress?.((update) => {
        setPlan((current) => (current?.id === update.id ? update : current));
      }),
    [],
  );
  const ready = plan?.rows.filter((row) => row.state === "ready").length ?? 0;
  const execute = (label: string, action: () => Promise<void>) =>
    void run(label, async () => {
      setError("");
      try {
        await action();
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      }
    });
  return (
    <Modal
      open
      title="Remise à zéro d’usine"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="addressing-review factory-reset-review">
        <Alert kind="danger">
          Le reset complet efface les réglages des caméras. Leurs IP et
          identifiants peuvent revenir aux valeurs d’usine. Cette action est
          irréversible ; le profil Sezaam enregistré dans Quasar est conservé.
        </Alert>
        <p>
          Les caméras sont traitées par IP croissante. Les IP en conflit sont
          exclues. Le lot s’arrête à la première erreur ou réponse incertaine,
          sans renvoyer la commande.
        </p>
        {error && <Alert kind="danger">{error}</Alert>}
        {!plan || plan.phase === "preview" ? (
          <Button
            disabled={busy || !cameras.length}
            onClick={() =>
              execute("Vérification des caméras avant reset", async () => {
                setPlan(undefined);
                setConfirmation("");
                setPlan(
                  await window.sezaam.call("previewFactoryReset", {
                    ids: cameras.map((c) => c.id),
                  }),
                );
              })
            }
          >
            Vérifier les {cameras.length} caméras
          </Button>
        ) : null}
        {plan && (
          <>
            <div className="addressing-table">
              <table>
                <caption>Caméras concernées — reset complet</caption>
                <thead>
                  <tr>
                    <th>Caméra</th>
                    <th>Identité</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((row) => (
                    <tr key={row.camera.id}>
                      <td>
                        <strong>{row.camera.ip}</strong>
                        <small>
                          {row.camera.name || row.camera.model || "Caméra"}
                        </small>
                      </td>
                      <td>
                        {row.camera.serial || row.camera.mac || "Non vérifiée"}
                      </td>
                      <td>
                        <strong>{labels[row.state]}</strong>
                        <small>{row.message}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.warning && <Alert kind="warning">{plan.warning}</Alert>}
            {plan.phase === "preview" && ready > 0 && (
              <>
                <p>
                  {ready} caméra(s) seront réinitialisées.{" "}
                  {plan.rows.length - ready} exclue(s). Une dernière
                  confirmation affichera les adresses avant l’envoi.
                </p>
                <Field label="Saisissez EFFACER pour autoriser le reset">
                  <input
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </Field>
                <Button
                  variant="destructive"
                  disabled={busy || confirmation !== resetConfirmation}
                  onClick={() =>
                    execute("Remise à zéro des caméras", async () => {
                      const reviewed = plan;
                      // Consume the review in the UI as well as in the main process.
                      setPlan({ ...reviewed, phase: "running" });
                      try {
                        setPlan(
                          await window.sezaam.call("applyFactoryReset", {
                            planId: reviewed.id,
                            confirmation,
                          }),
                        );
                      } catch (error) {
                        setPlan(undefined);
                        throw error;
                      } finally {
                        setConfirmation("");
                        onApplied();
                      }
                    })
                  }
                >
                  Réinitialiser {ready} caméra(s)
                </Button>
              </>
            )}
            {plan.phase === "running" && (
              <p role="status">
                {
                  plan.rows.filter((r) =>
                    ["accepted", "uncertain", "failed"].includes(r.state),
                  ).length
                }{" "}
                / {plan.rows.filter((r) => r.state !== "blocked").length}{" "}
                caméra(s) traitée(s). Ne débranchez pas le réseau pendant
                l’envoi.
              </p>
            )}
            {plan.phase === "complete" && (
              <>
                <Alert kind="warning">
                  Une commande acceptée ne confirme pas à elle seule le retour
                  aux paramètres d’usine. Attendez le redémarrage, puis
                  redétectez les caméras et reconnectez-vous avec leurs
                  identifiants actuels. Si plusieurs partagent la même IP
                  d’usine, utilisez « Attribuer les IP » pour vérifier la
                  résolution par identifiant constructeur sans débranchement.
                  Une caméra incompatible nécessite encore une isolation.
                </Alert>
                <Button
                  disabled={busy}
                  onClick={() =>
                    execute("Redétection après reset", async () => {
                      await window.sezaam.call("discover", undefined);
                      onApplied();
                    })
                  }
                >
                  Redétecter les caméras
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
