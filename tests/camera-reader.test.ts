import { it, expect } from "vitest";
import { CameraReader } from "../src/renderer/camera-reader";
import { displayValue } from "../src/renderer/format";
import type {
  CameraDetail,
  CameraDetailUpdate,
  Call,
} from "../src/shared/types";
it("formate absence, zéro, false et vide sans les confondre", () => {
  expect([undefined, null, 0, false, "", true].map(displayValue)).toEqual([
    "Non disponible",
    "Non disponible",
    "0",
    "Non",
    "Vide",
    "Oui",
  ]);
});
it("A → B → A : rejette réponses et événements tardifs, puis libère les abonnements", async () => {
  const listeners = new Set<(v: CameraDetailUpdate) => void>();
  const pending: {
    id: string;
    requestId: string;
    resolve: (v: CameraDetail) => void;
  }[] = [];
  const bridge = {
    call: ((_method: string, input: { id: string; requestId: string }) =>
      new Promise((resolve) => pending.push({ ...input, resolve }))) as Call,
    onCameraDetail: (fn: (v: CameraDetailUpdate) => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  const reader = new CameraReader(bridge);
  let selected = "A";
  const accepted: string[] = [];
  const detail = (id: string, label: string) =>
    ({ camera: { id }, readAt: label }) as CameraDetail;
  const read = (id: string) =>
    reader.read(
      id,
      false,
      () => selected === id,
      (d) => accepted.push(d.readAt!),
    );
  const a = read("A");
  selected = "B";
  const b = read("B");
  selected = "A";
  const again = read("A");
  for (const callback of listeners)
    callback({
      requestId: pending[0].requestId,
      detail: detail("A", "obsolete event"),
    });
  pending[0].resolve(detail("A", "old A"));
  pending[1].resolve(detail("B", "old B"));
  for (const callback of listeners)
    callback({
      requestId: pending[2].requestId,
      detail: detail("A", "partial A"),
    });
  pending[2].resolve(detail("A", "current A"));
  await Promise.all([a, b, again]);
  expect(accepted).toEqual(["partial A", "current A"]);
  expect(listeners.size).toBe(0);
});
