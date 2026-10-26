export type Preferences = {
  autoplay: boolean;
  lowLatency: boolean;
  previewQuality: "light" | "main";
};
export const defaultPreferences: Preferences = {
  autoplay: true,
  lowLatency: true,
  previewQuality: "light",
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
      previewQuality: value.previewQuality === "main" ? "main" : "light",
    };
  } catch {
    return defaultPreferences;
  }
}
export function preferredProfile(
  profiles: any[],
  quality: Preferences["previewQuality"],
) {
  const usable = profiles.filter((p) => p.$?.token || p.token);
  if (quality === "main") return usable[0];
  const area = (p: any) => {
    const r = p.videoEncoderConfiguration?.resolution;
    return r?.width > 0 && r?.height > 0 ? r.width * r.height : Infinity;
  };
  return [...usable].sort((a, b) => area(a) - area(b))[0];
}
export function compareCameraIPs(a: string, b: string) {
  const number = (ip: string) =>
    ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
  return number(a) - number(b);
}
