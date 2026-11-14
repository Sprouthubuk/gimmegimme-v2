// Browser tests for the reveal games, played on the development preview (/dev/reveal-games).
// Run: npm run test:games   (needs Chrome: CHROME_PATH or /usr/bin/google-chrome). Sample tickets only:
// nothing signs in, buys, or reaches the API. The "smoothness" frame-rate checks need a quiet machine: on a
// small one run them alone, e.g. GAMES_WORKERS=1 npx playwright test -g smoothness.
import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.GAMES_PORT ?? 4329);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/playwright",
  timeout: Number(process.env.GAMES_TIMEOUT ?? 180_000),
  fullyParallel: true,
  workers: Number(process.env.GAMES_WORKERS ?? 2),
  reporter: [["list"]],
  use: {
    baseURL,
    launchOptions: { executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] },
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    // --ignore-lock keeps it in the foreground (Astro 7 backgrounds a dev server it thinks an AI agent started).
    command: `GG_NO_DEV_TOOLBAR=1 npx astro dev --host 127.0.0.1 --port ${PORT} --ignore-lock`,
    url: `${baseURL}/dev/reveal-games`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
