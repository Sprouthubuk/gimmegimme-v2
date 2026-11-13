# Deploying on Laravel Forge

One server runs both halves: PHP-FPM serves Laravel, a Node daemon serves Astro, nginx in front
routes by path (`nginx.conf`). Same domain, so Sanctum cookies just work.

## One-off setup

1. **Server**: Forge app server (London, 4 GB), PHP 8.5 (with `gmp`, `intl`, `bcmath`), MySQL 8.4, Node 20+.
   In MySQL set `log_bin_trust_function_creators = 1` (Verity's triggers need it).
2. **Site**: `gimmegimmeprizes.co.uk`, project type "General PHP / Laravel", web directory
   `/backend/public`, zero-downtime deployments on, repo `Sprouthubuk/gimmegimme-v2`, branch `main`.
3. **Private Verity package**: Forge → Server → Composer credentials (or `auth.json`): a GitHub
   token with read access to `Sprouthubuk/verity-engine`.
4. **Environment**: paste `backend/.env.example` into Forge's environment editor and fill in
   the secrets (Cashflows, Resend, Verity keys). `SESSION_DOMAIN=gimmegimmeprizes.co.uk`,
   `SANCTUM_STATEFUL_DOMAINS=gimmegimmeprizes.co.uk`, `APP_URL=https://gimmegimmeprizes.co.uk`.
5. **Nginx**: edit the site's config with `nginx.conf` — both blocks: the main site and the private
   listener on 127.0.0.1:8080 that Astro uses to reach Laravel.
6. **Background processes**: Astro and the queue worker (`astro-daemon.conf`).
7. **Scheduler**: Forge → Scheduler → `php artisan schedule:run` every minute (expires unpaid
   orders, Verity schedules, bonus expiry, health email).
8. **SSL**: Let's Encrypt.
9. **Deploy script**: `forge-deploy.sh`, with "Make .env variables available to deployment script" on.

## Checks after a deploy

- `https://gimmegimmeprizes.co.uk/` loads; `/api/site` returns JSON; `/admin` shows Filament login.
- Sign in as a test player, buy one ticket from the wallet, play it.
- Cashflows sandbox: a card payment returns to `/order/GG-…` and confirms; a cancelled one puts
  the basket back.
