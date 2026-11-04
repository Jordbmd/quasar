import { z } from "zod";
const browserMetricSchema = z
  .object({
    screen: z.enum([
      "home",
      "catalog",
      "dashboard",
      "settings",
      "activity",
      "analysis",
      "documents",
      "conversations",
      "design",
    ]),
    name: z.enum(["page_view", "error", "lcp_ms", "inp_ms", "cls"]),
    value: z.number().min(0).max(12e4),
  })
  .strict()
  .refine((m) => m.name !== "cls" || m.value <= 10);
const metricSchema = browserMetricSchema.or(
  z
    .object({
      screen: browserMetricSchema.shape.screen,
      name: z.literal("server_ms"),
      value: z.number().min(0).max(12e4),
    })
    .strict(),
);
function createCollector({
  secret = "",
  fetchImpl = fetch,
  intervalMs = 1e4,
} = {}) {
  let queue = [];
  let running = false;
  let closed = false;
  async function flush() {
    if (!secret || running || closed || !queue.length) return;
    running = true;
    const batch = queue.splice(0, 50);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetchImpl(
            "https://admin.doublemart.fr/api/metrics",
            {
              method: "POST",
              redirect: "error",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${secret}`,
              },
              body: JSON.stringify(batch),
              signal: AbortSignal.timeout(1500),
            },
          );
          void response.body?.cancel().catch(() => {});
          if (response.ok || response.status < 500) break;
        } catch {}
      }
    } finally {
      running = false;
    }
  }
  const timer = secret ? setInterval(() => void flush(), intervalMs) : void 0;
  timer?.unref();
  return {
    enabled: !!secret,
    record(value) {
      if (!secret || closed || queue.length >= 200) return false;
      const metric = metricSchema.safeParse(value);
      if (!metric.success) return false;
      queue.push({ ...metric.data, project: "quasar" });
      return true;
    },
    flush,
    size: () => queue.length,
    close() {
      closed = true;
      if (timer) clearInterval(timer);
      queue = [];
    },
  };
}
export { createCollector };
