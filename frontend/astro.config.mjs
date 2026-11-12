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
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
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
