import { it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Socket } from "node:dgram";
import { discoverOnInterface } from "../src/main/discovery";
it("WS-Discovery injectée : cible multicast bornée, annulation et fermeture sans réseau réel", async () => {
  const events = new EventEmitter();
  const close = vi.fn();
  const send = vi.fn(
    (_b: Buffer, _p: number, _h: string, cb: (e: Error | null) => void) =>
      cb(null),
  );
  const socket = Object.assign(events, {
    bind: vi.fn((_p: number, _a: string, cb: () => void) => cb()),
    close,
    send,
    setMulticastInterface: vi.fn(),
    setMulticastTTL: vi.fn(),
    setMulticastLoopback: vi.fn(),
  }) as unknown as Socket;
  const abort = new AbortController();
  const pending = discoverOnInterface(
    "192.0.2.2",
    "255.255.255.0",
    abort.signal,
    3500,
    () => socket,
  );
  expect(send.mock.calls[0][1]).toBe(3702);
  expect(send.mock.calls[0][2]).toBe("239.255.255.250");
  abort.abort();
  await expect(pending).rejects.toThrow("interrompue");
  expect(close).toHaveBeenCalledOnce();
});
