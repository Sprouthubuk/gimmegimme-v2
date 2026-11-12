import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx,mjs}"],
    exclude: ["tests/fullstack/**", "node_modules/**"],
    environment: "node",
    testTimeout: 30000,
  },
});
