import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";

const SITE = new URL(process.env.PUBLIC_SITE_URL || "http://localhost:4321");

// Astro only trusts the Host / X-Forwarded-* headers for these names. Without this
// every request looks like "localhost" behind nginx and the origin check refuses
// every form post. Astro listens on 127.0.0.1, so only nginx (or this machine) can
// reach it; nginx's server_name decides which Host values ever arrive.
const allowedDomains = [
  { hostname: SITE.hostname, protocol: SITE.protocol.slice(0, -1) },
  { hostname: "localhost", protocol: "http" },
  { hostname: "127.0.0.1", protocol: "http" },
];

// Server-rendered on Forge by a Node process (see deploy/). Laravel answers /api,
// /sanctum, /admin and /webhooks on the same domain; nginx routes the rest here.
// /dev/reveal-games (every reveal game with sample purchases) exists only under `astro dev`: nothing of it is built.
const devOnlyPages = {
  name: "gg-dev-only-pages",
  hooks: {
    "astro:config:setup": ({ command, injectRoute }) => {
      if (command === "dev") injectRoute({ pattern: "/dev/reveal-games", entrypoint: "./src/dev/reveal-games.astro" });
    },
  },
};

export default defineConfig({
  // The browser game tests turn the dev toolbar off: it sits over the bottom of the screen, where the reveal sheets put their buttons.
  devToolbar: { enabled: process.env.GG_NO_DEV_TOOLBAR !== "1" },
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react(), devOnlyPages],
  site: process.env.PUBLIC_SITE_URL || "http://localhost:4321",
  server: { host: "127.0.0.1", port: 4321 },
  security: { checkOrigin: true, allowedDomains },
  vite: {
    server: {
      // In development, send API calls to Laravel (php artisan serve) or the mock API.
      proxy: {
        "/api": { target: process.env.API_INTERNAL_URL || "http://127.0.0.1:8000", changeOrigin: false },
        "/sanctum": { target: process.env.API_INTERNAL_URL || "http://127.0.0.1:8000", changeOrigin: false },
        "/media": { target: process.env.API_INTERNAL_URL || "http://127.0.0.1:8000", changeOrigin: false },
      },
    },
  },
});
