import { createHash } from "node:crypto";

// macOS local-network privacy keys its cache partly by LC_UUID. A copied
// Electron executable must not keep the UUID of every other Electron app.
// This build supports the thin, little-endian 64-bit executable shipped here.
export function assignAppUUID(binary, bundleId) {
  if (binary.length < 32 || binary.readUInt32LE(0) !== 0xfeedfacf)
    throw new Error(
      "Format Mach-O non pris en charge : application non signée.",
    );
  const end = 32 + binary.readUInt32LE(20);
  if (end > binary.length) throw new Error("En-tête Mach-O tronqué.");
  let offset = 32;
  let uuidOffset;
  for (let i = 0; i < binary.readUInt32LE(16); i++) {
    if (offset + 8 > end) throw new Error("Commande Mach-O tronquée.");
    const command = binary.readUInt32LE(offset);
    const size = binary.readUInt32LE(offset + 4);
    if (size < 8 || offset + size > end)
      throw new Error("Taille Mach-O invalide.");
    if (command === 0x1b) {
      if (size !== 24 || uuidOffset !== undefined)
        throw new Error("LC_UUID invalide.");
      uuidOffset = offset + 8;
    }
    offset += size;
  }
  if (uuidOffset === undefined) throw new Error("LC_UUID absent.");
  const uuid = createHash("sha256")
    .update(bundleId)
    .update(binary.subarray(uuidOffset, uuidOffset + 16))
    .digest()
    .subarray(0, 16);
  uuid[6] = (uuid[6] & 0x0f) | 0x80;
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  uuid.copy(binary, uuidOffset);
  return uuid.toString("hex");
}
