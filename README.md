# Gimme Gimme Prizes — v2

UK prize competitions at gimmegimmeprizes.co.uk. Replaces the Lovable build (`Sprouthubuk/gimmegimmev1`).

| Folder | What |
| --- | --- |
| `frontend/` | Astro 5 site (server-rendered, Node), React islands for the ticket picker, checkout, account forms and the ten reveal games |
| `backend/` | Laravel 12 API + Filament admin, Verity draw engine, Cashflows payments *(next stage)* |
| `shared/` | Values both halves must agree on (game and skin ids) |
| `docs/api.md` | The contract between them |
| `deploy/` | Laravel Forge: nginx routing, deploy script, Astro daemon |

## Run the front end locally

```bash
cd frontend
npm ci
npm run mock-api          # in-memory API on :8000 (player@example.com / password123)
npm run dev               # http://localhost:4321
```

## Tests

```bash
cd frontend
npm run build && npm test   # unit, islands, reveal-game integrity, end-to-end journeys
npx astro check             # types
```

The end-to-end tests start the built Astro server, the mock API and a small proxy that copies
nginx's routing, then walk real journeys: sign up, wallet checkout and play, card checkout
through the payment page and back, a declined card putting the wallet part back, the £1 card
minimum, XSRF protection, every account page, logging out.
