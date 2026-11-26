# Gimme Gimme API contract

The Astro front end (`frontend/`) talks to the Laravel backend (`backend/`) only through the
endpoints below. The TypeScript shapes are the source of truth: `frontend/src/lib/types.ts`.
`frontend/mock-api/server.mjs` implements this contract in memory and the end-to-end tests run
against it; the Laravel feature tests must cover the same behaviour.

## Ground rules

- **Same domain.** nginx sends `/api`, `/sanctum`, `/admin`, `/livewire`, `/verity`, `/storage` to
  Laravel and everything else to Astro (`deploy/nginx.conf`). No CORS.
- **Lists** come wrapped: `{ data: [...] }` (plus `total` / `hasMore` where they page).
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
| GET | `/api/site` | `SiteInfo` (cached 30s by Astro). `metaPixelId` is the Pixel ID set in the admin, or null; the site loads the Pixel only after the visitor accepts marketing cookies. `gimmeBox` and `referrals` are null while those features are off (both start off; see below) |
| GET | `/api/health` | `{ status: "ok"\|"failing", checks: { database, scheduler } }`, `200` or `503` (for an uptime monitor; scheduler = ran in the last 5 minutes) |
| GET | `/api/competitions?type=instant\|draw` | `{ data: CompetitionSummary[] }` (live and sold out, featured first, then closing soonest). `opensAt` is when a scheduled competition opens; `soldPercent` is rounded down (100 only when sold out); `featuredBundle` is a live draw's Our Pick bundle or null. `maxTickets`, `ticketsSold`, `ticketsLeft` and `maxPerPerson` (null = no limit) are public (owner, 22 Nov 2026; shown on the competition page, not cards); never the promo cap |
| GET | `/api/competitions/{slug}` | `CompetitionDetail`; `heldByMe` for the signed-in player; `bundles` = the bundles on sale now (only ones that still fit) |
| GET | `/api/winners/instant?limit=&page=&game=` | `{ data: InstantWinnerRow[], total }` |
| GET | `/api/winners/draws` | `{ data: DrawWinnerRow[] }` |
| GET | `/api/entry-lists` | `{ data: CompetitionSummary[] }` (no entry counts): every published competition once it opens, on sale first (closing soonest), then finished ones |
| GET | `/api/entry-lists/{slug}?q=&page=` | `{ competition, data: EntryRow[], hasMore }` (no total); open from the first sale; names masked ("L*** P."); `prizeName` on an instant-win ticket that won |
| GET | `/api/archive` | `{ data: ArchiveCompetitionSummary[] }`: the old (Lovable) site's competitions, read-only (`gimme:import-archive`). Not Verity records: never linked to `/verify` or called verified |
| GET | `/api/archive/winners` | `{ data: ArchiveWinnerRow[] }`: the old site's announced live-draw winners, newest first (masked names, town, winning ticket) |
| GET | `/api/archive/{slug}` | `{ competition: ArchiveCompetitionSummary, drawWinners: ArchiveWinnerRow[], hasInstantWins }` |
| GET | `/api/archive/{slug}/instant-wins?page=` | `{ data: ArchiveWinnerRow[], hasMore }` (50 a page, newest first) |
| GET | `/api/archive/{slug}/entries?q=&page=` | `{ data: EntryRow[], hasMore }` (no total, 100 a page; `q` is a ticket number); masked names as the old site showed them; `prizeName` on a ticket that won an instant prize |
| GET | `/api/competitions/{slug}/winning-numbers?show=all\|won\|left&q=&prize=&page=` | `WinningNumbersPage` (`prize` = one prize's name). A paid win isn't named (here, in `/api/winners/instant` or as an entry list's `prizeName`) until its player has played the reveal, or for an hour: every instant prize's winning ticket number, public from publish, biggest prize first, 100 a page; `404` for draws |
| GET | `/api/pages/{slug}` | `{ title, updatedAt, version, html, headings }` (terms, privacy, rules, cookies, free-entry) |
| POST | `/api/contact` | `{ name, email, topic, message }` → `204`; rate limited |

`CompetitionDetail.prizes` lists the prize *tiers* and how many of each are won. Which ticket number
wins each prize is public from publish (owner's decision, 18 Nov 2026) through `/winning-numbers`.
Prize boosts (owner, 23 Nov 2026): instant prizes Verity added after launch (spec §17) are in `CompetitionDetail.prizes`
(with `addedAt`), counted in `prizeCount` / `topPrizePence`, summed in `CompetitionSummary.boost` (`{addedCount,
addedPence, addedAt}` or null), listed in `/winning-numbers` (`addedAt` on each row, null for the launch prizes), and
summarised per addition in `CompetitionDetail.boostRecord[]` (from Verity's own record).

Live draw screen (owner, 25 Nov 2026): `GET /api/competitions/{slug}/live-draw` → `LiveDraw` (`no-store`), for
`/live-draw/{slug}`, the page shared on a livestream. `phase` is `not_open`, `open`, `waiting` (closed, waiting for the
drand round in `beacon`), `drawn` or `void`; `winners[]` (`place`, `ticketNumber`, masked `name`, `prizeName`) is empty
until Verity has drawn. Nothing on the screen picks a winner: the "Reveal Winner" button only animates what Verity drew.
404 for unpublished competitions and those without a draw.

Draw results are held until published (owner, 25 Nov 2026; `App\Services\DrawResults`): after Verity draws, the result is
left out of `/winners/draws`, the competition shows `closed`, the account doesn't show the win, Verity's record answers
423, and the winner isn't emailed or paid, until it is published. Only a request with the presenter `?key=` (made by the
admin's Live Draw Screen button, `App\Support\PresenterKey`, two days) gets `presenter: true` and the held winners.
`POST /api/competitions/{slug}/live-draw/publish` `{key}` publishes (403 without a valid key, 409 before the draw) and
returns the `LiveDraw`; the admin's "Publish Result" does the same, and `competitions:publish-draw-results` publishes
anything held longer than `DrawResults::HOLD_MAX_MINUTES` (180). `published` is true once out.

Shown prize names (owner, 23 Nov 2026): a prize can be shown on the site under a different name from the one Verity
committed to (`prize_display_names`, `App\Support\PrizeNames`). Every `prizeName` / prize `name` in the API is the shown
name; `?prize=` on `/winning-numbers` takes the shown name. `CompetitionDetail.renamedPrizes[]` (`{from, to}`, `from`
being Verity's name) lets a player match the page to the fair-play record, which keeps Verity's names.
Free-to-enter competitions (owner, 26 Nov 2026; docs/free-entry.md): every summary carries `isFree`. A free competition is
`pricePence` 0 and `maxPerPerson` 1; it is never priced in a basket (checkout refuses it). A signed-in player claims their ticket
with `POST /api/competitions/{slug}/free-entry` (no body): the same play check as a purchase (403 with its reason, or 422
`code` `sales_closed`), then `201 {order: {number, status: "paid"}}`; `422` `code` `already_entered` (has their ticket),
`closed` (not open, or sold out) or `not_free`. The order page shows the ticket and plays any instant win.

Mystery Hunts (owner, 26 Nov 2026; docs/mystery-hunt.md): `CompetitionDetail.hunt` is `HuntBoard` or `null`. It carries the
theme (`symbolName`, `hashtag`, `facebookUrl`, colours, `intro`), `claimHours`, `boardSize`, `found`, `notWon`, `picks[]`
(`{number, name, prizeName, valuePence, prizeType, pickedAt}`, the name masked like /winners), `prizes[]` (the hidden prizes,
`{name, valuePence, type, quantity, won}`), Verity's `fingerprint` and `sealedAt`, `revealed`, and `map[]`
(`{number, prizeName, valuePence, status: won | not_won}`) only once Verity has revealed the hunt (null before). Instant prize
`type` can also be `ticket_credit` (to bonus, expires) or `hunt_symbol` (worth £0; the finder picks a number).
That is safe only because Verity gives each buyer random unsold numbers at payment (it refuses
in-order numbering with instant wins); never publish with `ticket_allocation` other than `random`.
The seed that made the list stays sealed until the competition ends.
`CompetitionDetail.endPrize` is `{ name, valuePence, count }`: `count` winners each win the prize
(Verity draws that many different tickets; one person can win more than one, and every place is paid).
`presets` are the ticket quick-pick buttons (smallest first), `popularPreset` the one marked
"Most popular" (or null), and `minTickets` the fewest tickets one order can hold.

## Bundles ("Buy X Get Y Free", live draws)

A `BundleTier` is a preset (paid + free tickets); each draw chooses which it offers and which is Best
Value (`competition_bundle_tier`). A bundle is offered only while bundles are on, the tier is active,
it fits in the tickets left (less those being paid for) and it is no bigger than the competition's
`max_bundle_share_pct` of its tickets. `Bundle` = `{ id, label, paid, free, tickets, pricePence, savePence, ourPick }`
with `pricePence = paid × price` and `savePence = free × price`. Free tickets are ordinary entries: the
order line's `quantity` is paid + free and every one goes to Verity in the same entry.

## Basket and checkout

`POST /api/basket/price` — `{ lines: BasketLine[], promoCode?: string|null }` → `PricedBasket`.
A `BasketLine` is `{ competitionId, quantity }` (single tickets) or `{ competitionId, bundleId }`
(one bundle; a competition holds one bundle plus any singles). Works signed out (no wallet figures
then). Prices and ticket counts come only from the database; anything else the browser sends is
ignored. Each `PricedLine` has `quantity` (tickets: paid + free), `paidQuantity`, `freeQuantity`,
`bundleId`/`bundleLabel`, and `upgrade` (the next bundle up: `{ bundleId, label, tickets, freeQuantity, extraPence }`
or null). A line gets a `problem` when it cannot be bought as asked (closed, sold out, "Not that many
tickets are left. Please choose fewer.", "This bundle is no longer available. Please choose a smaller
one.", or under `minTickets`). It never says how many are left. `problems` holds basket-wide reasons
(sales closed, play block). Promo codes apply to single tickets only, take at most 50% off and never
make an order free. Unpaid orders hold their tickets for 15 minutes (`Order::HOLD_MINUTES`); checkout
locks each competition row so two orders can't both take the last tickets.

`POST /api/checkout` (signed in) —
`{ lines, payWith: "wallet"|"card", useWallet: boolean, promoCode, requestId }` → `CheckoutResult`.

1. Run the play check (sales switch, staff, 18+, email verified, self-exclusion, break, hold,
   spend limits including card payments in progress). Refuse with
   `403` + `code`.
2. Re-price on the server. A card part under `minCardPence` is `422`.
3. Take the wallet part at once (append-only ledger; spend deposit → bonus → winnings; bonus can pay
   for all of it). Not enough is `422`.
4. Wallet covers it → mark paid, issue entries through Verity in the same transaction, return
   `next: "play"` (or `"attention"` if entries could not all be issued — never auto-refunded).
5. Otherwise create a Cashflows payment job for the card part, store its reference on the order,
   return `next: "redirect"` and `redirectUrl`.

`GET /api/orders/{number}` → `OrderView` (own orders only; `404` otherwise). `trackValuePence` is
what the Meta pixel reports for the order: real money only (card, deposit and winnings), never bonus credit.

**Meta tracking (Conversions API).** No endpoint: `POST /api/checkout`, `POST /api/me/deposits` and
`POST /api/auth/register` note the event when the request carries the `gg_consent=accepted` cookie (written
by the cookie banner) and a Pixel ID is set; `_fbp`, `_fbc`, IP and browser name are kept with it. The
scheduler (`gimme:meta-events`, every minute) sends it once the order is paid. Event ids match the browser
pixel's so Meta counts each once: Purchase and the custom Deposit use the order number,
CompleteRegistration uses `reg-{user id}`. Customer details leave only SHA-256 hashed.

`POST /api/orders/{number}/return` — `{ leftAs?: "failed"|"cancelled" }` → `OrderView`. Called by
the payment return pages and polled by the order page. Asks Cashflows about the **stored** job
reference and confirms only when the job, order number and amount all match. When Cashflows says
it is not paid and `leftAs` is given, close the order and give back the wallet part. A late payment
on a closed order is still confirmed.

`POST /api/orders/{number}/play` → `PlayResult`. Instant prizes are won when the ticket is sold:
fulfilment plays every instant-win entry with Verity (`playGroup`) and credits cash and site-credit
prizes to winnings in the same transaction. This endpoint only reports the stored outcome for this
order's tickets, and marks them watched. Calling again returns the same result and pays nothing.
Each ticket carries `proofUrl`: the competition's public fairness record (`/verify/{ref}`). The premium
games (`frontend/packages/games`) read this response through `fromRevealOutcome` and only present it.

`POST /api/webhooks/cashflows` — `{ paymentJobReference }`. Nothing in the message is trusted: the
order is found **only** by the stored job reference, then confirmed through the same path as `/return`
(which asks Cashflows itself).

Return addresses given to Cashflows: success `/order/{n}` (deposits: `/account/wallet?deposit={n}`,
which calls `/return` server-side), failed `/payment/failed?order={n}`, cancelled
`/payment/cancelled?order={n}`.

## Gimme Box (lucky dip, live draws only)

Off unless an admin switches it on (`site.gimmeBox` is then `{ available, chipsPence, minPence, maxPence, bonusPct }`;
`available` is false when fewer than two draws can go in a box). While off every route below is `404`.

| Method | Path | Body → Returns |
| --- | --- | --- |
| POST | `/api/gimme-box` | `{ budgetPence, mode: "surprise"\|"big"\|"most", replaces?: boxId }` → `201 GimmeBox`. Budget in whole pounds within min/max (`422` otherwise). `replaces` releases an earlier box. Works signed out. Rate limited (`GIMME_BOX_RATE_PER_MINUTE`, 20) |
| POST | `/api/gimme-box/{id}/added` | — → `GimmeBox` (hold restarts); `410 { code: "gimme_box_gone" }` once released or paid |

A `GimmeBox` is `{ id, mode, budgetPence, totalPence, unusedPence, tickets, bonusTickets, expiresAt, lines, basketLines }`.
`totalPence` ≤ budget, and `unusedPence` is always less than one ticket of the cheapest competition in the box.
A box packs live draws and the instant-win games an admin has switched on (`gimme_box_enabled`), always at
least one live draw. Instant-win lines are paid single tickets only: no bundle and no bonus.
Each line has its competition's `type` (`draw` or `instant`), the player's own counts only (`paidQuantity`, `freeQuantity`, `bonusQuantity`, `tickets`,
`singles`, `bundleId`, `bundleLabel`, `linePence`, `unitPence`) and the draw's `soldPercent`: never a
ticket count of a draw. Prices are the competition page prices. A box holds its tickets for
`gimme_box_hold_minutes` (10). `basketLines` are `BasketLine`s with `boxId`: put them in the basket as
they are. While a line still holds what the box packed (same bundle, at least its singles) and the box
isn't released or paid, the server adds the box's bonus: the `PricedLine` then has `bonusQuantity` > 0
(inside `quantity`), `source: "gimme_box"` and `gimmeBoxId`. Order lines record the same.

**Promo ticket cap.** Each draw has `promo_ticket_cap_pct` (admin, default 5%): referral voucher tickets
and Gimme Box bonus tickets together never pass that share of its tickets (paid orders and unpaid ones
still in their hold are counted; postal entries and bundle free tickets never are). Once reached, a box
line and a `PricedLine` carry `bonusQuantity: 0` and `notice: "Bonus tickets for this draw have all been
given out."` (paid tickets still sell), and the voucher draw picker leaves the draw out. No response
carries the cap or the count. Every `PricedLine` and box line has `notice` (null when there's nothing to say).

## Refer a Friend

Off unless an admin switches it on (`site.referrals` is then `{ rewardType: "tickets"\|"credit", rewardTickets,
rewardCreditPence, minPurchasePence }`). While off every route below is `404`.

| Method | Path | Body → Returns |
| --- | --- | --- |
| GET | `/api/referrals/{code}` | `{ code, firstName }` of the referrer, for the join page; `404` for an unknown or closed account's code |
| GET | `/api/me/referrals` | `MyReferrals`: `{ code, link, stats: { invited, qualified, rewards, leftThisMonth, cap }, rewardType, rewardTickets, rewardCreditPence, minPurchasePence, vouchers: Voucher[], friends: { name, status, joinedAt }[] }` |
| GET | `/api/me/vouchers/{id}/draws` | `{ data: CompetitionSummary[] }`: live draws the voucher can go into (% sold only); a draw whose promo ticket cap can't take the voucher is left out |
| POST | `/api/me/vouchers/{id}/redeem` | `{ competitionId }` → `201 { order: { number, status } }`: a £0 order, tickets from Verity. `422` (`voucher_unavailable`, `voucher_draw`) or a play-check refusal |

A referral qualifies on the friend's first paid ticket order if its real money (card + deposit +
winnings; never bonus, vouchers or postal entries) is at least `minPurchasePence`. Then fraud checks
(same card hash, device, sign-up IP, address or email pattern: blocked), the review flag (many friends
from one IP or device), and the referrer's monthly cap (over it, only the friend is rewarded). A
refund within `referral_clawback_days` takes back unused rewards. `/r/{code}` on the site sets a
30-day first-party cookie and goes to `/join?ref={code}`.

## Account (signed in)

| Method | Path | Body → Returns |
| --- | --- | --- |
| POST | `/api/auth/register` | `{ firstName, lastName, email, password, dateOfBirth, marketingOptIn, referralCode?, deviceId?, next? }` → `Me` (signed in, email unverified); under 18 is `422`. `next` is a path on the site (e.g. the checkout for the tickets they picked): the confirmation link then redirects to `/verify-email?status=verified&next=…`, even in another browser; anything else is ignored. `referralCode` links the friend to a referrer (now or never; an unknown code is ignored). `deviceId` is a random id the browser keeps; only its hash is stored, for the referral fraud checks |
| POST | `/api/auth/login` | `{ email, password, remember }` → `Me`; throttled |
| POST | `/api/auth/logout` | → `204` |
| POST | `/api/auth/forgot-password` | `{ email }` → `204` always |
| POST | `/api/auth/reset-password` | `{ token, email, password }` → `204` |
| POST | `/api/auth/email/resend` | → `204` |
| GET | `/api/auth/email/verify/{id}/{hash}?expires&signature` | the signed link in the email; confirms and redirects to `/verify-email?status=verified` |
| GET | `/api/me` | `Me` |
| GET | `/api/me/wallet/transactions` | `{ data: WalletTransaction[] }` newest first |
| GET | `/api/me/tickets?tab=active\|to-play\|won\|past&limit=` | `{ data: TicketGroup[] }`; outcomes hidden until watched |
| GET | `/api/me/tickets/{order}/{competitionId}?page=` | `TicketPage`: every ticket of one order line, 500 a page (a `TicketGroup` lists only the first 40 plus winners, with `ticketCount`) |
| GET/POST | `/api/me/limits` | `Limits` / `{ weeklyDepositPence }` → `Limits` (lowering is instant, raising waits 24h) |
| POST | `/api/me/break` | `{ days }` → `Limits` (instant, no checks in front of it) |
| POST | `/api/me/self-exclude` | `{ months }` → `Limits` (instant) |
| PATCH | `/api/me/profile` | `{ phone }` → `Me` (name, date of birth fill-once) |
| PATCH | `/api/me/address` | `{ line1, line2, city, postcode }` → `Me` (fill-once) |
| PATCH | `/api/me/date-of-birth` | `{ dateOfBirth: "YYYY-MM-DD" }` → `Me`; only when none is on file (fill-once, `422` `fill_once` after), 18 or over (`422` on `dateOfBirth`) |
| PATCH | `/api/me/preferences` | `{ email, sms, winNotifications }` → `Me` |
| POST | `/api/me/password` | `{ currentPassword, password }` → `204` |
| POST | `/api/me/deposits` | `{ amountPence }` → `{ redirectUrl, orderNumber }` (min £5, max setting, play check) |
| POST | `/api/me/withdrawals` | `{ amountPence, accountName, sortCode, accountNumber }` → `201` (winnings only, min £20, needs `idCheck` verified; bank details stored encrypted, never returned; paid by hand; player emailed) |
| POST | `/api/me/id-check` | multipart `photoId`, `proofOfAddress` (JPG/PNG/HEIC/PDF, 10MB each) → `201 { idCheck: "pending" }`; refused while one is pending or once verified |

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

## Verification

`/verify/{ref}` (Astro) loads Verity's browser verifier (`/vendor/verity/verify-page/verity-verify.js`,
published from the package on deploy) against `/verity/competitions/{ref}/verification`
(`VERITY_ROUTES=true`). Every draw winner and competition links to it.
