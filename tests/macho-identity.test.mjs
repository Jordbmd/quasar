import { describe, it, expect } from "vitest";
import { assignAppUUID } from "../scripts/macho-identity.mjs";

function executable() {
  const b = Buffer.alloc(96, 0);
  b.writeUInt32LE(0xfeedfacf, 0);
  b.writeUInt32LE(2, 16);
  b.writeUInt32LE(32, 20);
  b.writeUInt32LE(0x1b, 32);
  b.writeUInt32LE(24, 36);
  b.fill(0xab, 40, 56);
  b.writeUInt32LE(0x2, 56);
  b.writeUInt32LE(8, 60);
  b.fill(0xcd, 64);
  return b;
}
describe("identité native macOS", () => {
  it("distingue les applications et conserve le code et les autres commandes", () => {
    const before = executable();
    const result = Buffer.from(before);
    const uuid = assignAppUUID(result, "fr.sezaam.camera-tool");
    expect(result.subarray(0, 40)).toEqual(before.subarray(0, 40));
    expect(result.subarray(56)).toEqual(before.subarray(56));
    expect(result.subarray(40, 56)).not.toEqual(before.subarray(40, 56));
    expect(assignAppUUID(executable(), "fr.sezaam.camera-tool")).toBe(uuid);
    expect(assignAppUUID(executable(), "another.app")).not.toBe(uuid);
  });
  it("refuse les exécutables inconnus ou incomplets avant toute signature", () => {
    expect(() => assignAppUUID(Buffer.alloc(32), "app")).toThrow(/Format/);
    expect(() => assignAppUUID(executable().subarray(0, 50), "app")).toThrow(
      /tronqué/,
    );
    const malformed = executable();
    malformed.writeUInt32LE(0, 36);
    expect(() => assignAppUUID(malformed, "app")).toThrow(/Taille/);
    const noUUID = executable();
    noUUID.writeUInt32LE(0x2, 32);
    expect(() => assignAppUUID(noUUID, "app")).toThrow(/absent/);
  });
});
