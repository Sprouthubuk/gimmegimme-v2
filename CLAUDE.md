# CLAUDE.md — Gimme Gimme Prizes v2

Read before every task. If a request conflicts with this, stop and ask.

## How we work
- Never commit or push to `main`. One branch per task; Liam reviews and merges.
- Plan first for anything non-trivial. For a bug, write a failing test first.
- Before every commit: `cd frontend && npx astro check && npm run build && npm test`
  (and `cd backend && php artisan test` once the backend exists).
- `docs/api.md` + `frontend/src/lib/types.ts` are the contract. Change both together, and the mock
  API (`frontend/mock-api/server.mjs`) and the Laravel tests with them.

## Money and fairness (carried over from v1 — non-negotiable)
- Money is whole pence. Prices, totals and outcomes come only from the server.
- Wallet: deposit / bonus / winnings, an append-only ledger; spend deposit → bonus → winnings;
  bonus pays at most 50% of a basket. The sign-up bonus exists but is switched off.
- Wallet part is taken at checkout before any ticket is issued; given back if the card fails.
- Card payments are confirmed only by asking Cashflows about the job reference stored on the order,
  matching job, order number and amount. The webhook finds orders only by that stored reference.
- Tickets and instant-win results come only from Verity, inside the payment-confirm transaction.
  Reveal games are presentation only (`frontend/src/games/`); `tests/games` proves a board can only
  show the result it was given.
- One play check on every path: sales switch (off by default), staff can't play, 18+, email
  verified, self-exclusion, break, hold, spend limits, £250/month credit-card cap.
  Self-exclusion and breaks always apply at once — no check or delay in front of them.
- A paid order that couldn't get all its tickets is flagged for a person, never auto-refunded.
- Never invent winners, reviews or trust figures. Free postal route always visible.
- All dates shown in UK time (`frontend/src/lib/time.ts`).

## Front end
- Title Case for every title. Mobile first (44px taps, 16px inputs, no sideways scroll at 320px).
- Nothing third-party loads before a cookie choice.
- Redirects after sign-in go through `safeNext` (`src/lib/safe.ts`).
- Astro trusts Host / X-Forwarded-* only for `allowedDomains` in `astro.config.mjs`; the build must
  have `PUBLIC_SITE_URL` set to the live address or form posts are refused.
