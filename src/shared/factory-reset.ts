import type { Camera } from "./types";
export const resetConfirmation = "EFFACER";
type FactoryResetRow = {
  camera: Camera;
  state:
    | "ready"
    | "blocked"
    | "sending"
    | "accepted"
    | "uncertain"
    | "failed"
    | "skipped";
  message: string;
};
export type FactoryResetPlan = {
  id: string;
  createdAt: string;
  phase: "preview" | "running" | "complete";
  rows: FactoryResetRow[];
  warning?: string;
};
