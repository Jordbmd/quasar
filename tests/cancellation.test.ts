import { getEventListeners } from "node:events";
import { expect, it } from "vitest";
import { abortable } from "../src/main/cancellation";

it("libère immédiatement un signal déjà annulé même si le transport reste pendant", async () => {
  const controller = new AbortController();
  const reason = new Error("selection changed");
  controller.abort(reason);
  await expect(
    abortable(new Promise(() => {}), controller.signal),
  ).rejects.toBe(reason);
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});

it("observe le rejet tardif du transport après annulation sans conserver l'écouteur", async () => {
  const controller = new AbortController();
  let fail!: (error: Error) => void;
  const work = new Promise<void>((_resolve, reject) => (fail = reject));
  const pending = abortable(work, controller.signal);
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(1);
  controller.abort();
  await expect(pending).rejects.toBe(controller.signal.reason);
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  fail(new Error("late transport failure"));
  await Promise.resolve();
});

it("libère l'écouteur dès la réussite ou l'échec et conserve le mode sans signal", async () => {
  const controller = new AbortController();
  const work = Promise.resolve(42);
  expect(abortable(work)).toBe(work);
  await expect(abortable(work, controller.signal)).resolves.toBe(42);
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  const error = new Error("transport failure");
  await expect(
    abortable(Promise.reject(error), controller.signal),
  ).rejects.toBe(error);
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});
