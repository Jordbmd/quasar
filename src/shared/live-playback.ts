// Distance to the latest buffered frame, not end-to-end camera latency.
export function livePlayback(
  current: number,
  start: number,
  end: number,
  lowLatency: boolean,
) {
  const target = lowLatency ? 0.25 : 0.8;
  const maxLag = lowLatency ? 1.2 : 3;
  const lag = Math.max(0, end - current);
  const seek =
    current < start || lag > maxLag ? Math.max(start, end - target) : undefined;
  return {
    seek,
    rate: seek === undefined && lowLatency && lag > 0.5 ? 1.05 : 1,
  };
}
