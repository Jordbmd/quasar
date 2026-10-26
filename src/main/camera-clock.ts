import { nodes, parseXML, textOf } from "./osd";
export function parseCameraClock(xml: string) {
  const system = nodes(parseXML(xml), "SystemDateAndTime")[0];
  const utc = system && nodes(system.children, "UTCDateTime")[0];
  if (!utc)
    throw Error(
      "La caméra n’a pas fourni sa date UTC ; synchronisation non vérifiable.",
    );
  const parseDate = (value: NonNullable<typeof utc>) => {
    const get = (name: string) => {
      const raw = textOf(value.children, name);
      if (!/^\d+$/.test(raw)) throw Error("Date caméra invalide.");
      return Number(raw);
    };
    const [year, month, day, hour, minute, second] = [
      "Year",
      "Month",
      "Day",
      "Hour",
      "Minute",
      "Second",
    ].map(get);
    const at = Date.UTC(year, month - 1, day, hour, minute, second),
      d = new Date(at);
    if (
      d.getUTCFullYear() !== year ||
      d.getUTCMonth() !== month - 1 ||
      d.getUTCDate() !== day ||
      hour > 23 ||
      minute > 59 ||
      second > 59
    )
      throw Error("Date caméra invalide.");
    return at;
  };
  const local = nodes(system.children, "LocalDateTime")[0];
  return {
    at: parseDate(utc),
    localAt: local ? parseDate(local) : undefined,
    timezone: textOf(system.children, "TZ"),
    daylightSavings: ["true", "1"].includes(
      textOf(system.children, "DaylightSavings"),
    ),
    mode: textOf(system.children, "DateTimeType"),
  };
}

// Compatibility for devices that add DST to the UTC value itself. Keep UTC
// untouched and explicitly use today's local offset; never subtract an hour
// from the date sent to the device to hide the firmware's error.
export function fixedClockSettings(zone: string, now = new Date()) {
  const settings = clockSettings(zone, now);
  if (zone === "UTC") return settings;
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value;
  if (offset !== "GMT+1" && offset !== "GMT+2")
    throw Error("Décalage horaire de Paris non vérifiable.");
  return {
    ...settings,
    timezone: offset === "GMT+1" ? "CET-1" : "CEST-2",
    daylightSavings: false,
  };
}

export function hasDSTClockError(
  got: ReturnType<typeof parseCameraClock>,
  settings: ReturnType<typeof clockSettings>,
  now = Date.now(),
) {
  return (
    settings.daylightSavings &&
    got.daylightSavings &&
    got.mode === "Manual" &&
    timezonesEquivalent(got.timezone, settings.timezone) &&
    (Math.abs(got.at - now - 3600000) <= 10000 ||
      (Math.abs(got.at - now) <= 10000 &&
        got.localAt !== undefined &&
        Math.abs(
          got.localAt - localClockAt(got.at, "Europe/Paris") - 3600000,
        ) <= 10000))
  );
}

function localClockAt(at: number, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const n = (key: string) => Number(parts.find((p) => p.type === key)?.value);
  return Date.UTC(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour"),
    n("minute"),
    n("second"),
  );
}

export function localClockMatches(
  got: ReturnType<typeof parseCameraClock>,
  zone: string,
) {
  return (
    got.localAt !== undefined &&
    Math.abs(got.localAt - localClockAt(got.at, zone)) <= 10000
  );
}

export function clockTimezoneMatches(
  got: ReturnType<typeof parseCameraClock>,
  settings: ReturnType<typeof clockSettings>,
) {
  if (got.daylightSavings !== settings.daylightSavings) return false;
  if (timezonesEquivalent(got.timezone, settings.timezone)) return true;
  // With DST disabled, firmware may retain its dormant transition rules.
  // Validate the complete rules before comparing the effective fixed offset.
  if (!got.daylightSavings && timezonesEquivalent(got.timezone, got.timezone)) {
    const standard = /^[A-Za-z]{3,}[+-]?\d{1,2}(?::\d{1,2}(?::\d{1,2})?)?/.exec(
      got.timezone,
    )?.[0];
    return !!standard && timezonesEquivalent(standard, settings.timezone);
  }
  return false;
}
export function clockSettings(zone: string, now = new Date()) {
  if (zone === "UTC")
    return {
      dateTimeType: "Manual",
      dateTime: now,
      timezone: "UTC0",
      daylightSavings: false,
    };
  if (zone !== "Europe/Paris")
    throw Error("Fuseau horaire non pris en charge.");
  return {
    dateTimeType: "Manual",
    dateTime: now,
    timezone: "CET-1CEST,M3.5.0/2,M10.5.0/3",
    // ONVIF: enable the TZ's automatic DST rules, including during winter.
    daylightSavings: true,
  };
}

// Compare POSIX rules, not firmware-specific formatting. A missing DST offset
// means standard offset minus one hour; /2 and /02:00:00 are identical.
// Only the fixed-offset and M-rule forms we send are accepted here.
export function timezonesEquivalent(actual: string, expected: string): boolean {
  const seconds = (raw: string, maxHour: number) => {
    if (!/^[+-]?\d{1,3}(?::\d{1,2}(?::\d{1,2})?)?$/.test(raw)) return undefined;
    const [h, m = 0, s = 0] = raw.replace(/^[+-]/, "").split(":").map(Number);
    if (h > maxHour || m > 59 || s > 59) return undefined;
    return (raw.startsWith("-") ? -1 : 1) * (h * 3600 + m * 60 + s);
  };
  const normalize = (zone: string) => {
    const parts = zone.trim().split(",");
    const head =
      /^([A-Za-z]{3,})([+-]?\d{1,2}(?::\d{1,2}(?::\d{1,2})?)?)(?:([A-Za-z]{3,})([+-]?\d{1,2}(?::\d{1,2}(?::\d{1,2})?)?)?)?$/.exec(
        parts[0],
      );
    if (!head) return undefined;
    const std = seconds(head[2], 24);
    if (std === undefined) return undefined;
    if (!head[3]) return parts.length === 1 ? JSON.stringify([std]) : undefined;
    const dst = head[4] === undefined ? std - 3600 : seconds(head[4], 24);
    if (dst === undefined || parts.length !== 3) return undefined;
    const rules = parts.slice(1).map((rule) => {
      const match = /^M(\d{1,2})\.(\d)\.(\d)(?:\/(.+))?$/.exec(rule);
      if (!match) return undefined;
      const [month, week, day] = match.slice(1, 4).map(Number);
      const at = seconds(match[4] ?? "2", 167);
      if (
        month < 1 ||
        month > 12 ||
        week < 1 ||
        week > 5 ||
        day > 6 ||
        at === undefined
      )
        return undefined;
      return [month, week, day, at];
    });
    if (rules.some((r) => r === undefined)) return undefined;
    return JSON.stringify([std, dst, ...rules]);
  };
  const a = normalize(actual),
    b = normalize(expected);
  return a !== undefined && b !== undefined && a === b;
}

export function cameraClockPayload(settings: ReturnType<typeof clockSettings>) {
  const d = settings.dateTime;
  return `<sz:DateTimeType>Manual</sz:DateTimeType><sz:DaylightSavings>${settings.daylightSavings}</sz:DaylightSavings><sz:TimeZone><tt:TZ xmlns:tt="http://www.onvif.org/ver10/schema">${settings.timezone}</tt:TZ></sz:TimeZone><sz:UTCDateTime xmlns:tt="http://www.onvif.org/ver10/schema"><tt:Time><tt:Hour>${d.getUTCHours()}</tt:Hour><tt:Minute>${d.getUTCMinutes()}</tt:Minute><tt:Second>${d.getUTCSeconds()}</tt:Second></tt:Time><tt:Date><tt:Year>${d.getUTCFullYear()}</tt:Year><tt:Month>${d.getUTCMonth() + 1}</tt:Month><tt:Day>${d.getUTCDate()}</tt:Day></tt:Date></sz:UTCDateTime>`;
}
