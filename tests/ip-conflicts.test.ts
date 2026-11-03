import { expect, it } from "vitest";
import { conflictSchedule } from "../src/main/addressing";
import type { Camera } from "../src/shared/types";
const cam = (id: string, ip: string): Camera => ({
  id,
  ip,
  port: 80,
  path: "/onvif/device_service",
  status: "Conflit",
  ambiguous: false,
  mac: id,
});
const cameras = [
  cam("a", "192.168.1.13"),
  cam("b", "192.168.1.13"),
  cam("c", "192.168.1.14"),
];
const candidates = [
  "192.168.1.254",
  "192.168.1.253",
  "192.168.1.252",
  "192.168.1.251",
];
const plan = (
  items = cameras,
  occupied = new Set<string>(),
  targets = new Set(items.map((c) => c.id)),
  allowed?: (id: string, ip: string) => boolean,
) =>
  conflictSchedule(
    items,
    occupied,
    ["192.168.1.2"],
    targets,
    candidates,
    allowed,
  );
it("résout uniquement les doublons sans casier et conserve une caméra à chaque IP", () => {
  const result = plan();
  expect(result.rows.map((r) => r.id)).toEqual(["a", "b"]);
  expect(result.rows.every((r) => !("locker" in r))).toBe(true);
  expect(result.steps).toEqual([
    { id: "b", from: "192.168.1.13", to: candidates[0], kind: "final" },
    { id: "a", from: "192.168.1.13", to: "192.168.1.13", kind: "verify" },
  ]);
  expect(cameras[1].ip).toBe("192.168.1.13");
  expect(plan([...cameras].reverse())).toEqual(result);
});
it("réserve des adresses différentes pour plusieurs groupes, sans prendre une IP occupée", () => {
  const result = plan(
    [...cameras, cam("d", "192.168.1.14")],
    new Set([candidates[0]]),
  );
  expect(
    result.steps.filter((s) => s.kind === "final").map((s) => s.to),
  ).toEqual(candidates.slice(1, 3));
  expect(result.rows.filter((r) => r.state === "ready")).toHaveLength(4);
});
it("bloque tout le groupe si une identité est inconnue, mais laisse les autres conflits traitables", () => {
  const result = plan(
    [...cameras, cam("d", "192.168.1.14")],
    new Set(),
    new Set(["a", "c", "d"]),
  );
  expect(result.rows.slice(0, 2).every((r) => r.state === "blocked")).toBe(
    true,
  );
  expect(result.steps.map((s) => s.id)).toEqual(["d", "c"]);
});
it("n’effectue aucun déplacement partiel quand les IP libres sont insuffisantes ou incompatibles", () => {
  expect(plan(cameras, new Set(candidates)).steps).toEqual([]);
  expect(
    plan(cameras, new Set(), new Set(["a", "b", "c"]), () => false).steps,
  ).toEqual([]);
  const three = [...cameras, cam("d", "192.168.1.13")];
  expect(plan(three, new Set(candidates.slice(1))).steps).toEqual([]);
});
it("ne change aucune caméra saine et contrôle sans écriture une ambiguïté restante", () => {
  expect(plan([cam("a", "192.168.1.13")]).rows).toEqual([]);
  const result = plan([{ ...cameras[0], ambiguous: true }]);
  expect(result.steps).toEqual([
    { id: "a", from: cameras[0].ip, to: cameras[0].ip, kind: "verify" },
  ]);
});
