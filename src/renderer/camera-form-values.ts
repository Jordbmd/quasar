import type { CameraDetail } from "../shared/types";
import { arr } from "./ui";
import { videoCapabilities } from "../shared/video-options";
const maskFromPrefix = (p: number) =>
  Number.isInteger(p) && p >= 1 && p <= 30
    ? [24, 16, 8, 0]
        .map((n) => ((0xffffffff << (32 - p)) >>> n) & 255)
        .join(".")
    : "";
export function networkValues(d?: CameraDetail) {
  const n = arr(d?.network.data).find(
    (n) =>
      arr(n.IPv4?.config?.manual).some((x) => x.address === d?.camera.ip) ||
      n.IPv4?.config?.fromDHCP?.address === d?.camera.ip,
  );
  const ip =
    arr(n?.IPv4?.config?.manual).find((x) => x.address === d?.camera.ip) ??
    n?.IPv4?.config?.fromDHCP;
  return {
    address: d?.camera.ip ?? "",
    mask: maskFromPrefix(ip?.prefixLength),
    dhcp: !!n?.IPv4?.config?.DHCP,
    gateway: String(arr(d?.gateway.data?.IPv4Address)[0] ?? ""),
    dns: arr(
      d?.dns.data?.fromDHCP ? d?.dns.data?.DNSFromDHCP : d?.dns.data?.DNSManual,
    )
      .map((x) => x.IPv4Address)
      .filter(Boolean)
      .join(", "),
  };
}
export function videoValues(e: any) {
  const c = e?.config;
  return {
    codec: c?.encoding ?? "",
    resolution: c?.resolution
      ? `${c.resolution.width}x${c.resolution.height}`
      : "",
    fps: String(c?.rateControl?.frameRateLimit ?? ""),
    bitrate: String(c?.rateControl?.bitrateLimit ?? ""),
    quality: String(c?.quality ?? ""),
    constantBitrate: String(c?.rateControl?.$?.ConstantBitRate ?? false),
    govLength: String(c?.[c?.encoding]?.govLength ?? c?.$?.GovLength ?? ""),
  };
}
export function options(e: any, codec: string) {
  const caps = videoCapabilities(e, codec);
  return {
    ...caps,
    rateMode:
      caps.constantBitrate && !(e?.config?.rateControl?.averageBitRate > 0),
  };
}
