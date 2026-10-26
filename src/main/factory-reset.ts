import { randomUUID } from "node:crypto";
import type { Camera } from "../shared/types";
import {
  resetConfirmation,
  type FactoryResetPlan,
} from "../shared/factory-reset";
import { identityMatches } from "./discovery";

type Hooks = {
  context: () => string;
  read: (id: string) => Promise<Camera>;
  check: (camera: Camera) => Promise<void>;
  send: (id: string) => Promise<void>;
  confirm: (text: string) => Promise<boolean>;
  save: (plan: FactoryResetPlan) => Promise<void>;
  finish: () => Promise<void>;
  safe: (error: unknown) => string;
  progress?: (plan: FactoryResetPlan) => void;
};
export class FactoryReset {
  private reviewed?: { plan: FactoryResetPlan; context: string };
  constructor(private hooks: Hooks) {}
  async preview(cameras: Camera[]) {
    this.reviewed = undefined;
    if (
      !cameras.length ||
      cameras.length > 256 ||
      new Set(cameras.map((c) => c.id)).size !== cameras.length
    )
      throw Error("Liste de caméras invalide.");
    const context = this.hooks.context();
    const plan: FactoryResetPlan = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      phase: "preview",
      rows: [],
    };
    for (const camera of [...cameras].sort((a, b) =>
      a.ip.localeCompare(b.ip, undefined, { numeric: true }),
    )) {
      const row: FactoryResetPlan["rows"][number] = {
        camera: structuredClone(camera),
        state: "blocked",
        message: "",
      };
      try {
        if (
          camera.ambiguous ||
          cameras.filter((c) => c.ip === camera.ip).length > 1
        )
          throw Error(
            "IP partagée : isolez cette caméra avant une remise à zéro.",
          );
        const current = await this.hooks.read(camera.id);
        if (
          current.ip !== camera.ip ||
          current.ambiguous ||
          !identityMatches(camera, current)
        )
          throw Error(
            "Identité absente ou modifiée. Reconnectez cette caméra.",
          );
        row.camera = structuredClone(current);
        row.state = "ready";
        row.message =
          "Identité contrôlée. La prise en charge du reset sera confirmée à l’envoi.";
      } catch (error) {
        row.message = this.hooks.safe(error);
      }
      plan.rows.push(row);
    }
    if (context !== this.hooks.context())
      throw Error("Réseau ou session modifié. Préparez à nouveau le reset.");
    this.reviewed = { plan: structuredClone(plan), context };
    return plan;
  }
  async apply(id: string, confirmation: string) {
    if (confirmation !== resetConfirmation)
      throw Error("Saisissez EFFACER pour confirmer.");
    const saved = this.reviewed;
    this.reviewed = undefined;
    if (
      !saved ||
      saved.plan.id !== id ||
      Date.now() - Date.parse(saved.plan.createdAt) > 120000 ||
      saved.context !== this.hooks.context()
    )
      throw Error(
        "Préparation expirée ou contexte modifié. Vérifiez à nouveau les caméras.",
      );
    const plan = saved.plan;
    const ready = plan.rows.filter((r) => r.state === "ready");
    if (!ready.length)
      throw Error("Aucune caméra prête pour la remise à zéro.");
    if (
      !(await this.hooks.confirm(
        `Effacer les réglages de ${ready.length} caméra(s) et restaurer les valeurs d’usine ?\n\n${ready.map((r) => `${r.camera.ip} · ${r.camera.serial || r.camera.mac}`).join("\n")}\n\nLes réglages, adresses IP et identifiants peuvent être perdus. Plusieurs caméras peuvent revenir à la même IP. Aucun retour arrière automatique. Le profil Sezaam enregistré dans Quasar sera conservé.`,
      ))
    )
      throw Error("Remise à zéro annulée.");
    if (
      saved.context !== this.hooks.context() ||
      Date.now() - Date.parse(plan.createdAt) > 120000
    )
      throw Error(
        "Préparation expirée ou contexte modifié pendant la confirmation.",
      );
    const checkpoint = async () => {
      await this.hooks.save(structuredClone(plan));
      this.hooks.progress?.(structuredClone(plan));
    };
    plan.phase = "running";
    await checkpoint(); // A durable record is required before any destructive command.
    let stopped = false;
    let attempted = false;
    try {
      for (const row of ready) {
        if (stopped) {
          row.state = "skipped";
          row.message = "Non envoyée : le lot a été interrompu.";
          continue;
        }
        let sending = false;
        try {
          if (saved.context !== this.hooks.context())
            throw Error("Réseau ou session modifié.");
          await this.hooks.check(row.camera);
          if (saved.context !== this.hooks.context())
            throw Error("Réseau ou session modifié.");
          row.state = "sending";
          row.message = "Envoi du reset complet…";
          await checkpoint();
          sending = attempted = true;
          await this.hooks.send(row.camera.id); // Never retry a factory reset.
          row.state = "accepted";
          row.message =
            "Commande acceptée. Redémarrage et état d’usine à contrôler après redétection.";
        } catch (error) {
          row.state = sending ? "uncertain" : "failed";
          row.message =
            (sending
              ? "Résultat non confirmé ; ne relancez pas sans vérifier la caméra. "
              : "Commande non envoyée. ") + this.hooks.safe(error);
          stopped = true;
        }
        try {
          await checkpoint();
        } catch (error) {
          plan.warning =
            "Enregistrement du bilan interrompu : " + this.hooks.safe(error);
          stopped = true;
        }
      }
    } finally {
      if (attempted) {
        try {
          await this.hooks.finish();
        } catch (error) {
          plan.warning = this.hooks.safe(error);
        }
      }
      plan.phase = "complete";
      try {
        await checkpoint();
      } catch (error) {
        plan.warning = "Bilan non enregistré : " + this.hooks.safe(error);
      }
    }
    return plan;
  }
}
