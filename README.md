# Gimme Gimme Prizes — v2

UK prize competitions at gimmegimmeprizes.co.uk. Replaces the Lovable build (`Sprouthubuk/gimmegimmev1`).

| Folder | What |
| --- | --- |
| `frontend/` | Astro 5 site (server-rendered, Node), React islands for the ticket picker, checkout, account forms and the ten reveal games |
| `backend/` | Laravel 12 API + Filament admin (`/admin`), Verity draw engine, Cashflows payments, wallet |
| `shared/` | Values both halves must agree on (game and skin ids) |
| `docs/api.md` | The contract between them |
| `docs/lovable-import.md` | Moving players and balances from the Lovable site |
| `deploy/` | Laravel Forge: nginx routing, deploy script, Astro daemon |

## Run it locally

```bash
# Backend (needs PHP 8.3 with gmp, and a GitHub token that can read Sprouthubuk/verity-engine)
cd backend
composer install
cp .env.example .env && php artisan key:generate
# for a laptop: DB_CONNECTION=sqlite, CASHFLOWS_DRIVER=fake, VERITY_BEACON=local, APP_ENV=local in .env
php artisan migrate --seed --seeder='Database\Seeders\DemoSeeder'   # sample comps, player@example.com / password123, admin@example.com / admin-password-123
php artisan storage:link && php artisan serve                       # :8000

# Front end
cd frontend
npm ci
npm run dev               # http://localhost:4321, proxying /api to :8000
# or without PHP: npm run mock-api (an in-memory stand-in for the API) and npm run dev
```

First real admin on the server: `php artisan gimme:make-admin you@example.com`.

## Tests

```bash
cd backend && php artisan test         # wallet, orders, Cashflows, Verity, API, admin, jobs, import (SQLite; CI also runs MySQL)
cd frontend && npx astro check         # types
cd frontend && npm run build && npm test             # unit, islands, reveal-game integrity, journeys on the mock API
cd frontend && npm run build && npm run test:fullstack  # the built site against the real Laravel + Verity
cd frontend && npm run build && npm run test:visual     # every page at 4 sizes in Chrome; screenshots in /tmp/gg-shots
```

The end-to-end tests start the built Astro server, an API (the mock, or real Laravel for
`test:fullstack`) and a small proxy that copies nginx's routing, then walk real journeys: sign up, wallet checkout and play, card checkout
through the payment page and back, a declined card putting the wallet part back, the £1 card
minimum, XSRF protection, every account page, logging out.
