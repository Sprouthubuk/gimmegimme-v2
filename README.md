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

## Bundles ("Buy X Get Y Free")

Live draws can sell bundles of paid + free tickets. Free tickets are entered exactly like paid ones.

- **Add or change a tier:** Admin → Competitions → **Bundles**. A tier is paid + free tickets with an
  optional label (empty = "Buy 5 Get 5 Free"). Switching a tier off stops every competition selling it.
  The five defaults (5+5, 10+15, 20+40, 40+100, 80+280) come with the migration.
- **On a competition:** Admin → the competition → **Bundles**: turn on "Sell bundles", tick the tiers,
  pick which one is badged "Our Pick", and set the biggest bundle as a % of tickets (default 10%). The margin
  preview underneath recalculates as you type (sell-out on singles, worst case all in the biggest
  allowed bundle with Cashflows fees, profit and break-even) and warns when the worst case is a loss.
- **Report:** Admin → Competitions → **Bundle Report** (average order, tickets per order, orders by bundle).

## Gimme Box (lucky dip)

A player sets a budget (£5–£100) and a style (Surprise Me, Biggest Prizes, Most Tickets); the server packs
2–4 live draws with the best bundles and singles the budget buys, at the competition page prices, never
over budget, plus a % of bonus tickets (default 10%). The tickets are held 10 minutes. **Off by default.**

- **Switch on / settings:** Admin → Settings → **Gimme Box** (budget buttons, limits, bonus %, hold, leave out
  draws over x% sold, slow-seller boost, report warning level). It only shows when at least two live draws qualify.
- **Per draw:** Admin → the competition → **Gimme Box**: in or out, and how often it's picked (weight).
  The margin preview shows bonus tickets issued so far and the worst case with the bonus.
- **Report:** Admin → Competitions → **Gimme Box Report**.

## Refer a Friend

Each player gets a share link (`/r/CODE`). A friend who joins through it and spends £5+ of real money on
their first order gets 10 free tickets for a live draw of their choice (a voucher, 30 days), and so does
the referrer (up to 10 a month), or bonus credit if set. Fraud checks block same card / device / IP /
address / email pattern; many friends from one IP or device go to a review queue. **Off by default.**

- **Before switching on:** load the draft terms with `php artisan gimme:legal-pages --drafts`, have them
  reviewed, and edit them in Admin → Pages (`referral-terms`).
- **Switch on / settings:** Admin → Settings → **Refer A Friend**.
- **Review queue and report:** Admin → Marketing → **Referrals** (approve / reject with a reason).
- **Launch draws:** `php artisan gimme:launch-drafts` creates the five launch draws as drafts with
  their bundles; add pictures, prize values, dates and descriptions, then publish.

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
