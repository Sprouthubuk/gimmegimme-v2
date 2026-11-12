import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/fullstack/**/*.test.ts"], environment: "node", testTimeout: 60000, hookTimeout: 120000, fileParallelism: false },
});
