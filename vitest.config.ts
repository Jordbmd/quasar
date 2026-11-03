import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.mjs"],
    testTimeout: 15000,
    // Bound process-heavy RTSP and workbook tests on developer machines and CI.
    maxWorkers: 4,
  },
});
