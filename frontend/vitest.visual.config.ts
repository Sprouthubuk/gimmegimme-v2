import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/visual/**/*.test.ts"], environment: "node", testTimeout: 60000, hookTimeout: 180000, fileParallelism: false },
});
