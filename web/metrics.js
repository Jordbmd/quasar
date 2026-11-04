import { onCLS, onINP, onLCP } from "web-vitals";
function createBrowserMetrics(send) {
  let queue = [],
    sending = false,
    closed = false;
  let lastView;
  const record = (metric) => {
    if (
      closed ||
      queue.length >= 200 ||
      !Number.isFinite(metric.value) ||
      metric.value < 0 ||
      metric.value > (metric.name === "cls" ? 10 : 12e4)
    )
      return;
    queue.push(metric);
  };
  return {
    record,
    view(screen, key) {
      if (lastView === key) return;
      lastView = key;
      record({ screen, name: "page_view", value: 1 });
    },
    async flush() {
      if (sending || closed || !queue.length) return;
      sending = true;
      const batch = queue.splice(0, 50);
      try {
        await send(batch);
      } catch {
      } finally {
        sending = false;
      }
    },
    size: () => queue.length,
    close() {
      closed = true;
      queue = [];
    },
  };
}
let instance;
function startBrowserMetrics(screen, key) {
  if (instance) {
    instance.view(screen, key);
    return instance;
  }
  const metrics = createBrowserMetrics(async (batch) => {
    const response = await fetch("/api/metrics/browser", {
      method: "POST",
      credentials: "same-origin",
      redirect: "error",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(1500),
    });
    void response.body?.cancel().catch(() => {});
  });
  instance = metrics;
  metrics.view(screen, key);
  onLCP(({ value }) => metrics.record({ screen, name: "lcp_ms", value }));
  onINP(({ value }) => metrics.record({ screen, name: "inp_ms", value }));
  onCLS(({ value }) => metrics.record({ screen, name: "cls", value }));
  const flush = () => {
    void metrics.flush();
  };
  setInterval(flush, 1e4);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted)
      metrics.record({ screen, name: "page_view", value: 1 });
  });
  window.addEventListener("error", () =>
    metrics.record({ screen, name: "error", value: 1 }),
  );
  window.addEventListener("unhandledrejection", () =>
    metrics.record({ screen, name: "error", value: 1 }),
  );
  return metrics;
}
if (
  typeof document !== "undefined" &&
  document.body.dataset.metrics === "enabled"
)
  startBrowserMetrics("home", document.documentElement.lang);
export { createBrowserMetrics, startBrowserMetrics };
