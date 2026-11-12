# Gimme Gimme API contract

The Astro front end (`frontend/`) talks to the Laravel backend (`backend/`) only through the
endpoints below. The TypeScript shapes are the source of truth: `frontend/src/lib/types.ts`.
`frontend/mock-api/server.mjs` implements this contract in memory and the end-to-end tests run
against it; the Laravel feature tests must cover the same behaviour.

## Ground rules

- **Same domain.** nginx sends `/api`, `/sanctum`, `/admin`, `/webhooks`, `/media` to Laravel and
  everything else to Astro (`deploy/nginx.conf`). No CORS.
- **Auth** is Sanctum SPA cookie auth. Browser code calls `GET /sanctum/csrf-cookie` once, then
  sends `X-XSRF-TOKEN` (the decoded `XSRF-TOKEN` cookie) on every write. A missing or wrong token
  is `419`. Astro's server-side calls forward the visitor's `Cookie`, with `Origin`/`Referer` set
  to `PUBLIC_SITE_URL` so Sanctum treats them as first-party, and copy any `Set-Cookie` back.
- **Money is whole pence** (integers) everywhere, in and out. Never floats, never "12.50".
- **Dates** are ISO 8601 in UTC. The front end shows UK time.
- **Errors** are `ApiError`: `{ message, errors?: { field: [msg] }, code? }`. `422` validation,
  `401` not signed in, `403` signed in but not allowed (with `code`, e.g. `self_excluded`),
  `404`, `409` conflict (stale/duplicate), `419` CSRF, `429` rate limited.
  `message` is safe to show a player; never include internals.
- **Ids** are opaque strings (ULIDs). Order numbers are `GG-…` (tickets) and `GD-…` (deposits).
- Every money-moving `POST` is idempotent: checkout takes a `requestId`; the same id returns the
  same order.

## Public

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/site` | `SiteInfo` (cached 30s by Astro) |
| GET | `/api/competitions?status=live` | `CompetitionSummary[]` (live and sold out, featured first, then closing soonest) |
| GET | `/api/competitions/{slug}` | `CompetitionDetail`; `heldByMe` for the signed-in player |
| GET | `/api/winners/instant?limit=&page=&game=` | `{ data: InstantWinnerRow[], total }` |
| GET | `/api/winners/draws` | `DrawWinnerRow[]` |
| GET | `/api/entry-lists` | `{ slug, title, closesAt, drawAt, entries }[]` closed or drawn draws |
| GET | `/api/entry-lists/{slug}?q=&page=` | `{ competition, data: EntryRow[], total }`; names masked ("Liam P.") |
| GET | `/api/pages/{slug}` | `{ title, updatedAt, version, html, headings }` (terms, privacy, rules, cookies, free-entry) |
| POST | `/api/contact` | `{ name, email, topic, message }` → `204`; rate limited |

`CompetitionDetail.prizes` lists the prize *tiers* and how many of each are won. It must never
reveal which ticket numbers win (Verity holds them until the competition ends).

## Basket and checkout

`POST /api/basket/price` — `{ lines: BasketLine[], promoCode?: string|null }` → `PricedBasket`.
Works signed out (no wallet figures then). Prices come only from the database. Each line gets a
`problem` when it cannot be bought as asked (closed, sold out, over the per-person limit with
`maxQuantity` set to what is still allowed). `problems` holds basket-wide reasons (sales closed,
play block). Promo codes take at most 50% off and never make an order free.

`POST /api/checkout` (signed in) —
`{ lines, payWith: "wallet"|"card", useWallet: boolean, promoCode, requestId }` → `CheckoutResult`.

1. Run the play check (sales switch, staff, 18+, email verified, self-exclusion, break, hold,
   spend limits including card payments in progress, £250/month credit-card cap). Refuse with
   `403` + `code`.
2. Re-price on the server. A card part under `minCardPence` is `422`.
3. Take the wallet part at once (append-only ledger; spend deposit → bonus → winnings; bonus ≤ 50%
   of the basket). Not enough is `422`.
4. Wallet covers it → mark paid, issue entries through Verity in the same transaction, return
   `next: "play"` (or `"attention"` if entries could not all be issued — never auto-refunded).
5. Otherwise create a Cashflows payment job for the card part, store its reference on the order,
   return `next: "redirect"` and `redirectUrl`.

`GET /api/orders/{number}` → `OrderView` (own orders only; `404` otherwise).

`POST /api/orders/{number}/return` — `{ leftAs?: "failed"|"cancelled" }` → `OrderView`. Called by
the payment return pages and polled by the order page. Asks Cashflows about the **stored** job
reference and confirms only when the job, order number and amount all match. When Cashflows says
it is not paid and `leftAs` is given, close the order and give back the wallet part. A late payment
on a closed order is still confirmed.

`POST /api/orders/{number}/play` → `PlayResult`. Reveals the order's unplayed instant-win tickets
(Verity `playGroup('order:{id}')`). The outcome is already decided and credited; the response only
reports it. `outcome.tickets` holds this order's tickets only. Calling again returns the same
result.

`POST /webhooks/cashflows` — verifies the `Hash` header, finds the order **only** by the stored
job reference, then confirms through the same path as `/return`.

## Account (signed in)

| Method | Path | Body → Returns |
| --- | --- | --- |
| POST | `/api/auth/register` | `{ firstName, lastName, email, password, dateOfBirth, marketingOptIn }` → `Me` (signed in, email unverified); under 18 is `422` |
| POST | `/api/auth/login` | `{ email, password, remember }` → `Me`; throttled |
| POST | `/api/auth/logout` | → `204` |
| POST | `/api/auth/forgot-password` | `{ email }` → `204` always |
| POST | `/api/auth/reset-password` | `{ token, email, password }` → `204` |
| POST | `/api/auth/email/resend` | → `204` |
| GET | `/api/me` | `Me` |
| GET | `/api/me/wallet/transactions` | `WalletTransaction[]` newest first |
| GET | `/api/me/tickets?tab=active\|to-play\|won\|past&limit=` | `TicketGroup[]` |
| GET/POST | `/api/me/limits` | `Limits` / `{ weeklyDepositPence }` → `Limits` (lowering is instant, raising waits 24h) |
| POST | `/api/me/break` | `{ days }` → `Limits` (instant, no checks in front of it) |
| POST | `/api/me/self-exclude` | `{ months }` → `Limits` (instant) |
| PATCH | `/api/me/profile` | `{ phone }` → `Me` (name, date of birth fill-once) |
| PATCH | `/api/me/address` | `{ line1, line2, city, postcode }` → `Me` (fill-once) |
| PATCH | `/api/me/preferences` | `{ email, sms, winNotifications }` → `Me` |
| POST | `/api/me/password` | `{ currentPassword, password }` → `204` |
| POST | `/api/me/deposits` | `{ amountPence }` → `{ redirectUrl }` (min £5, play check) |
| POST | `/api/me/withdrawals` | `{ amountPence }` → `204` (winnings only, min £20, ID checked; paid by hand) |

`Me.playBlock` is the same reason the play check would give, so the site can explain it before
the player tries.

## Reveal shapes

```ts
RevealOutcome = { purchaseId, tickets: { ticketNumber, competitionId, competitionTitle,
  prize: { name, valuePence, type: "cash"|"site_credit"|"physical" } | null }[],
  totalWonPence, creditedPence, balanceAfterPence? }
RevealContext = { [competitionId]: { game, isInstantWin, prizeLabels, inLiveDraw,
  endPrizeName?, skin? } }
```

Every cash or site-credit prize is credited to the winnings balance before the response is sent;
`physical` prizes are fulfilled by hand and are not in `creditedPence`.
