import {
  parseCameraClock,
  clockSettings,
  cameraClockPayload,
  fixedClockSettings,
  hasDSTClockError,
  localClockMatches,
  clockTimezoneMatches,
} from "./camera-clock";
import type { CameraConnection } from "./onvif";
import type { ProfileJournal } from "./profile-journal";
import type { Diagnostics } from "./diagnostics";
import type { Api, WriteResult } from "../shared/types";
import type { FieldVerification } from "../shared/profile-journal";
type ClockContext = {
  approve: (
    id: string,
    description: string,
    confirmation: boolean,
  ) => Promise<CameraConnection>;
  profileJournal: ProfileJournal;
  log: Diagnostics;
  writeAndVerify: (
    id: string,
    send: () => Promise<unknown>,
    verify: () => Promise<boolean>,
  ) => Promise<WriteResult>;
};
/** Preserve the V1 bounded DST compatibility correction; never retry an uncertain write. */
export async function syncClock(
  context: ClockContext,
  v: Api["syncCameraTime"]["input"],
): Promise<WriteResult> {
  const conn = await context.approve(
    v.id,
    "Synchroniser la date et l’heure avec le poste",
    false,
  );
  const originalClock = await conn.soap("GetSystemDateAndTime", "", true);
  parseCameraClock(originalClock);
  await context.profileJournal.backupVendor(
    conn.camera,
    "clock",
    originalClock,
  );
  let settings = clockSettings(v.timezone);
  let compatibility = false;
  let fields: Record<string, FieldVerification> | undefined;
  const out = await context.writeAndVerify(
    v.id,
    async () => {
      try {
        await conn.soap(
          "SetSystemDateAndTime",
          cameraClockPayload(settings),
          true,
        );
        const got = parseCameraClock(
          await conn.soap("GetSystemDateAndTime", "", true),
        );
        conn.cam.timeShift = got.at - process.uptime() * 1000;
        // A second, different configuration is allowed only after an
        // acknowledged write and a precise, confirmed DST error. Never
        // retry writes after timeout or an unavailable readback.
        if (hasDSTClockError(got, settings)) {
          settings = fixedClockSettings(v.timezone);
          compatibility = true;
          await conn.soap(
            "SetSystemDateAndTime",
            cameraClockPayload(settings),
            true,
          );
          context.log.add(
            "attention",
            "Compatibilité de l’horloge",
            "La caméra gère incorrectement l’heure d’été. Décalage local actuel appliqué ; resynchroniser au changement été/hiver.",
            conn.camera.ip,
          );
        }
      } finally {
        conn.cam.timeShift = Date.now() - process.uptime() * 1000;
      }
    },
    async () => {
      const got = parseCameraClock(
        await conn.soap("GetSystemDateAndTime", "", true),
      );
      conn.cam.timeShift = got.at - process.uptime() * 1000;
      fields = {
        syncTime: {
          verified:
            Math.abs(got.at - Date.now()) <= 10000 &&
            got.mode === "Manual" &&
            (got.localAt === undefined
              ? !compatibility
              : localClockMatches(got, v.timezone)),
          observed: new Date(got.at).toISOString(),
        },
        clockTimezone: {
          verified: clockTimezoneMatches(got, settings),
          observed: compatibility
            ? `${got.timezone} · compatibilité : décalage actuel, resynchronisation nécessaire au changement été/hiver`
            : got.timezone,
        },
      };
      return Object.values(fields).every((f) => f.verified);
    },
  );
  out.fields = fields;
  if (compatibility && out.verified)
    out.message +=
      " Compatibilité horloge : resynchronisez au changement été/hiver.";
  return out;
}
