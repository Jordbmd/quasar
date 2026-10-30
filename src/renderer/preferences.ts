export type Preferences = {
  autoplay: boolean;
  lowLatency: boolean;
  previewQuality: "main";
};
const defaultPreferences: Preferences = {
  autoplay: true,
  lowLatency: true,
  previewQuality: "main",
};
export function readPreferences(): Preferences {
  try {
    const value = JSON.parse(
      localStorage.getItem("quasar-preferences") || "{}",
    );
    return {
      autoplay: typeof value.autoplay === "boolean" ? value.autoplay : true,
      lowLatency:
        typeof value.lowLatency === "boolean" ? value.lowLatency : true,
      // Retain the legacy key, but always default to the main stream.
      previewQuality: "main",
    };
  } catch {
    return defaultPreferences;
  }
}
export function preferredProfile(profiles: any[]) {
  const usable = profiles.filter((p) => p.$?.token || p.token);
  const main = usable.find((p) =>
    [p.name, p.$?.token, p.token].some(
      (value) =>
        typeof value === "string" &&
        /^(main[\s_-]*stream|main|principal|flux[\s_-]*principal)$/i.test(
          value.trim(),
        ),
    ),
  );
  if (main) return main;
  // Unnamed profiles: prefer the highest known resolution, never mutate them.
  const area = (p: any) => {
    const r = p.videoEncoderConfiguration?.resolution;
    return r?.width > 0 && r?.height > 0 ? r.width * r.height : 0;
  };
  return [...usable].sort((a, b) => area(b) - area(a))[0];
}
export function compareCameraIPs(a: string, b: string) {
  const number = (ip: string) =>
    ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
  return number(a) - number(b);
}
