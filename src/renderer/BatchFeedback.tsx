import React, { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Alert } from "./design-system/components";
import type { AddressPlan } from "../shared/addressing";
import type { DefaultsPlan, DefaultsProgress } from "../shared/defaults";

export function BatchProgress({
  title,
  progress,
}: {
  title: string;
  progress?: DefaultsProgress;
}) {
  const [started] = useState(Date.now);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [started]);
  const total = progress?.total || 0;
  return (
    <section className="batch-progress" aria-label={title} aria-busy="true">
      <div className="batch-progress-heading">
        <LoaderCircle className="spin" size={20} aria-hidden="true" />
        <strong>{title}</strong>
        <span className="batch-elapsed" aria-hidden="true">
          {Math.floor(seconds / 60)} min {String(seconds % 60).padStart(2, "0")}{" "}
          s
        </span>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">
        {progress
          ? [progress.stage, progress.camera].filter(Boolean).join(" · ")
          : "Préparation et confirmation de l’opération…"}
      </div>
      <progress
        aria-label="Avancement de l’opération"
        max={total || 1}
        value={total ? Math.min(progress!.completed, total) : undefined}
      />
      <small>
        {total ? `${progress!.completed} / ${total} caméras traitées. ` : ""}
        Gardez Quasar ouvert jusqu’au bilan. Une caméra peut prendre plusieurs
        minutes.
      </small>
    </section>
  );
}

export function AddressOutcome({ plan }: { plan: AddressPlan }) {
  const count = (state: AddressPlan["rows"][number]["state"]) =>
    plan.rows.filter((row) => row.state === state).length;
  const attention =
    count("failed") + count("skipped") + count("blocked") + count("ready");
  return (
    <Alert kind={attention ? "warning" : "success"}>
      <strong>
        Attribution des IP terminée{attention ? " — points à vérifier" : ""}.
      </strong>
      <span className="batch-summary">
        {count("verified")} adresses modifiées et vérifiées ·{" "}
        {count("unchanged")} déjà conformes · {count("failed")} échecs ou
        résultats non confirmés ·{" "}
        {count("blocked") + count("skipped") + count("ready")} non exécutées.
      </span>
    </Alert>
  );
}

export function ProfileOutcome({
  plan,
}: {
  plan: DefaultsPlan & { status?: string };
}) {
  const attention = plan.cameras.filter(
    (camera) =>
      camera.error ||
      camera.rows.some((row) => !["verified", "same"].includes(row.state)),
  ).length;
  return (
    <Alert
      kind={attention || plan.status === "interrupted" ? "warning" : "success"}
    >
      <strong>
        {plan.status === "interrupted"
          ? "Application du profil interrompue"
          : "Application du profil terminée"}
        {attention ? " — points à vérifier" : ""}.
      </strong>
      <span className="batch-summary">
        {plan.cameras.length - attention} caméra(s) entièrement conformes ·{" "}
        {attention} avec des réglages à vérifier ou à traiter manuellement. Le
        détail reste disponible par caméra ci-dessous.
      </span>
    </Alert>
  );
}
