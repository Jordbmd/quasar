import React, { useEffect, useState } from "react";
import type { AddressPlan, AddressProgress } from "../shared/addressing";
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
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  run: Run;
  cameras: Camera[];
  onApplied: () => void;
}) {
  const [start, setStart] = useState("1");
  const [plan, setPlan] = useState<AddressPlan>();
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
        finished ? "Bilan d’attribution des IP" : "Attribuer les IP par casier"
      }
      busy={busy}
      status={
        <>
          {phase && (
            <BatchProgress key={phase} title={phase} progress={progress} />
          )}
          {finished && plan && <AddressOutcome plan={plan} />}
          {error && <Alert kind="danger">{error}</Alert>}
        </>
      }
      footer={
        <Button disabled={busy} onClick={onClose}>
          {finished ? "Fermer le bilan" : "Fermer"}
        </Button>
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="addressing-review">
        <p>
          Casier 1 → 192.168.1.11, casier 2 → 192.168.1.12. Les caméras sont
          classées par IP actuelle puis par identité. Vérifiez l’ordre avant
          d’appliquer.
        </p>
        <Field label="Premier casier">
          <input
            type="number"
            min="1"
            max="244"
            value={start}
            disabled={busy}
            onChange={(e) => {
              setStart(e.target.value);
              setPlan(undefined);
              setApplied(false);
              setFinished(false);
            }}
          />
        </Field>
        <Button
          disabled={busy || !cameras.length || !start}
          onClick={() =>
            execute("Vérification de la plage d’adresses", async () => {
              setPlan(undefined);
              setApplied(false);
              setFinished(false);
              setPlan(
                await window.sezaam.call("previewAddresses", {
                  start: Number(start),
                }),
              );
            })
          }
        >
          Vérifier les adresses
        </Button>
        {plan && (
          <>
            <div className="addressing-table">
              <table>
                <caption>Plan d’adressage — masque 255.255.255.0</caption>
                <thead>
                  <tr>
                    <th>Caméra</th>
                    <th>Casier</th>
                    <th>Adresse actuelle</th>
                    <th>Nouvelle adresse</th>
                    <th>Résultat</th>
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
                      <td>{row.to}</td>
                      <td>
                        {row.message}
                        {cameras.find((c) => c.id === row.id)?.ambiguous && (
                          <Button
                            disabled={busy}
                            onClick={() => {
                              setIsolating(row.id);
                              setIsolated(false);
                            }}
                          >
                            Résoudre le conflit
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!applied && (
              <>
                <p>
                  {ready} caméra(s) à modifier. Les lignes bloquées seront
                  exclues. Les changements seront vérifiés un par un ; le lot
                  s’arrêtera si un résultat reste incertain.
                </p>
                <Button
                  variant="primary"
                  disabled={busy || !ready}
                  onClick={() =>
                    execute(
                      "Attribution et vérification des IP — cela peut prendre plusieurs minutes",
                      async () => {
                        const reviewed = plan;
                        setApplied(true);
                        setPlan(
                          await window.sezaam.call("applyAddresses", {
                            planId: reviewed.id,
                          }),
                        );
                        setFinished(true);
                        onApplied();
                      },
                    )
                  }
                >
                  Attribuer les IP à {ready} caméra(s)
                </Button>
              </>
            )}
          </>
        )}
        {cameras.some((c) => c.ambiguous) && !plan && (
          <Alert kind="warning">
            Des caméras partagent la même IP. Vérifiez la plage pour accéder au
            parcours de résolution.
          </Alert>
        )}
        {selected && (
          <section className="addressing-isolation">
            <h3>Résoudre le conflit à {selected.ip}</h3>
            <p>
              Gardez uniquement la caméra choisie branchée au switch. Identité
              attendue : <code>{selected.mac || selected.endpoint}</code>. La
              vérification ne change encore aucune adresse.
            </p>
            <label>
              <input
                type="checkbox"
                checked={isolated}
                disabled={busy}
                onChange={(e) => setIsolated(e.target.checked)}
              />{" "}
              J’ai laissé uniquement cette caméra branchée.
            </label>
            <Button
              disabled={busy || !isolated}
              onClick={() =>
                execute("Vérification de la caméra isolée", async () => {
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
              Vérifier la caméra isolée
            </Button>
            <p>
              Après confirmation, vérifiez la plage et attribuez une nouvelle IP
              avant de rebrancher la caméra suivante. Aucun ciblage par MAC non
              vérifié n’est envoyé.
            </p>
          </section>
        )}
      </div>
    </Modal>
  );
}
