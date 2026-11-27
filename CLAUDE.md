# CLAUDE.md — Gimme Gimme Prizes v2

Read before every task. If a request conflicts with this, stop and ask.

## How we work
- Never commit or push to `main`. One branch per task; Liam reviews and merges.
- Plan first for anything non-trivial. For a bug, write a failing test first.
- Before every commit: `cd backend && php artisan test`, then
  `cd frontend && npx astro check && npm run build && npm test && npm run test:fullstack && npm run test:visual`
  (the last saves screenshots of every page at four sizes to /tmp/gg-shots — look at the ones you changed — and
  runs `tests/visual/journey.test.ts`: a real phone browser joins, confirms the email, pays by card, plays, buys from
  the wallet, tops up and recovers from a declined and a cancelled card, failing on any page or console error, and `tests/visual/mobile-audit.test.ts`: crawls every page at 390px and 320px,
  signed out and in, and fails on errors, sideways scroll, taps under 40px, inputs under 16px or unlabelled, broken images or a
  missing h1, then checks the same pages on 768px and 1024px tablets and a 1440px desktop; findings and page weights go to
  /tmp/gg-audit).
- `docs/api.md` + `frontend/src/lib/types.ts` are the contract. Change both together, and the mock
  API (`frontend/mock-api/server.mjs`) and the Laravel tests with them.

## Money and fairness (carried over from v1 — non-negotiable)
- Money is whole pence. Prices, totals and outcomes come only from the server.
- Wallet: deposit / bonus / winnings, an append-only ledger; spend deposit → bonus → winnings;
  bonus can pay for a whole basket (no 50% cap: owner, 26 Nov 2026). There is no sign-up / deposit-match bonus (removed for launch); the bonus
  bucket holds credit an admin adds and bonus brought over from the old site, until it expires.
- Wallet part is taken at checkout before any ticket is issued; given back if the card fails.
- Card payments are confirmed only by asking Cashflows about the job reference stored on the order,
  matching job, order number and amount. The webhook finds orders only by that stored reference,
  answers at once and confirms in the queued `ConfirmGatewayPayment` job (never slow work in the webhook itself).
- Tickets and instant-win results come only from Verity, inside the payment-confirm transaction.
  Winning ticket numbers and entry lists are public from publish (`/winning-numbers`, `/entry-lists`):
  safe only with random ticket numbers, so publishing always uses `ticket_allocation` `random`.
  Reveal games are presentation only (`frontend/src/games/`); `tests/games` proves a board can only
  show the result it was given.
- One play check on every path: sales switch (off by default), staff can't play, 18+, email
  verified, self-exclusion, break, hold, spend limits, the per-person limit. No credit-card cap (owner, 18 Nov 2026).
  Max tickets per person is set per competition in the admin (owner, 22 Nov 2026; empty = no limit, stored as the
  number of tickets), fixed at publish, enforced by `CompetitionState::canBuy` and shown as `maxPerPerson` (null = no limit).
  Self-exclusion and breaks always apply at once — no check or delay in front of them.
- At fulfilment only WINNING entries are played through Verity (`Fulfilment::playAll`: entries with an
  `instant_ticket_id`), so an order's cost doesn't grow with its ticket count; never go back to
  `Verity::playGroup` per ticket at checkout (`tests/Feature/BigOrdersTest` holds a query budget).
- Live draw screen (owner, 25 Nov 2026): `/live-draw/{slug}` (Admin → Competitions → Live Draw Screen) is shared on the
  livestream. Verity still draws at the closing time from its committed drand round; the screen polls
  `/api/competitions/{slug}/live-draw` and "Reveal Winner" only animates the winners Verity drew (masked names, as /winners).
  Never let the screen pick, re-roll or reorder a winner, and never make it the way a draw happens.
- Draw results are held until published (owner, 25 Nov 2026; `App\Services\DrawResults`): after Verity draws, the
  winner isn't emailed or paid, the result is left out of /winners, accounts and the competition's status (`closed`), and
  Verity's record answers 423 (`HoldDrawRecord`), until it's published: the presenter's "Publish Results" on the live
  draw screen (its admin `?key=`, `App\Support\PresenterKey`), Admin → Competitions → Publish Result, or the safety net
  `competitions:publish-draw-results` after `HOLD_MAX_MINUTES`. Publishing pays and emails through `Fulfilment` once.
  Never pay, email or list a drawn winner any other way; a held result is only ever delayed, never changed.
- End prizes: `end_prize_count` places. One person can win more than one, and every place is paid: there is no
  redraw for a repeat winner (owner, 22 Nov 2026; Terms 7.6). `end_prize_type` site_credit
  pays winnings once (reference `verity-winner:{id}`); physical opens a claim for a person.
- A paid order that couldn't get all its tickets is flagged for a person, never auto-refunded.
- Prize boosts (owner, 23 Nov 2026; docs/prize-boosts.md): extra instant prizes for a live instant-win competition are
  added only by Verity (`Verity::addInstantPrizes`, verity-v3.2.0, spec §17), run by `competitions:boost-prizes`
  (`App\Services\PrizeBoosts`, lists in `resources/boosts/`, one Verity addition per competition per batch reason).
  They are ordinary Verity instant prizes on numbers nobody held, so Fulfilment pays them as usual; never add prizes
  any other way.
- Free-to-enter competitions (owner, 26 Nov 2026; docs/free-entry.md): `competitions.is_free`, £0 and one ticket per person,
  fixed at publish, for live draws and instant wins. The only way in is `App\Services\FreeEntry::claim` (`POST
  /api/competitions/{slug}/free-entry`: the play check, the competition locked, then `Orders::issueFree` with source
  `free_entry`). Never sell one through the basket (`Pricing` refuses it), bundle it, box it or make it a hunt.
- Mystery Hunts (owner, 26 Nov 2026; docs/mystery-hunt.md): an instant-win game with a theme (`hunt_themes`) and one instant
  prize of type `hunt_symbol` (£0). The prizes behind the board's numbers are `hunt_prizes`; at publish `App\Services\Hunts::seal`
  has Verity seal which is behind each number (`Verity::createHunt`, verity-v3.3.0, spec §18) before any ticket. Nobody, admins
  included, can see the map until Verity reveals it (`hunts:tick`, after the close plus one claim window, with no find still open).
  A symbol win is a `hunt_claim`, never a payment; only the Hunt Board (Admin → Competitions → Hunt Board → Open a Number) picks
  a number, through `Hunts::pick`, which asks Verity for that one prize and pays it once (reference `hunt-claim:{id}`: cash to
  winnings, ticket credit to bonus with the bonus expiry). A find not picked within `hunt_claim_hours` (48) isn't won. Never
  choose, move or pay a hunt prize any other way, and never show `map` before `revealed`.
- Prize names on the site (owner, 23 Nov 2026): no "Jackpot" or "Bonus", and no two prizes in a game with the same name.
  Verity's record keeps the names it committed to; a different shown name lives in `prize_display_names` and every
  place a player sees a prize name goes through `App\Support\PrizeNames` (page, winning numbers, entry lists, winners,
  reveal, account, wallet line, emails, reports). The competition page lists each rename next to the fair-play link.
- Bundles ("Buy X Get Y Free", live draws only): priced and sized only by `App\Services\Bundles` /
  `Pricing` from the bundle id; free tickets go to Verity in the same entry as the paid ones (no flag).
  A bundle bigger than what's left or than `max_bundle_share_pct` is never offered or sold. The featured
  tier is badged "Our Pick" (owner, 19 Nov 2026): never "Best Value" (it isn't the cheapest per ticket) or
  "Most Popular" (not backed by sales data). Promo codes apply to singles only. Unpaid orders
  hold tickets for `Order::HOLD_MINUTES` (15).
- Ticket counts (owner, 22 Nov 2026, replacing the 19 Nov "% sold only" rule): every competition summary carries
  `maxTickets`, `ticketsSold`, `ticketsLeft` and `maxPerPerson`. Players see them only on the competition page, as one
  quiet line under the % sold bar ("Max X tickets · Y sold · Z left · Max N per person"), and the per-person limit in the
  ticket picker; cards show % sold, "Almost gone!" from 90% and "Sold Out" only
  (`BundlesTest::test_competitions_show_players_the_maximum_sold_and_left_tickets`). Never shown: the promo cap and how much of it is used. Entry lists and
  the fair-play record stay public as they are (don't gate them or touch Verity), and Terms 4.3 stays.
- Gimme Box (lucky dip: live draws, plus instant-win games an admin has switched on, which start switched off; owner, 22 Nov 2026)
  and Refer a Friend are each behind a setting (`feature_gimme_box`,
  `feature_referrals`, Admin → Settings), off by default; never switch them on in a migration or seeder.
  A box is packed and priced only by `GimmeBoxPacker` at the competition page prices, never over budget, always with at
  least one live draw; instant-win lines are paid singles only, never a bundle or bonus (also refused in `Pricing`);
  its bonus tickets are added by `Pricing` only while the basket line still matches the box. Referral
  rewards come only from `App\Services\Referrals` on the friend's first real-money order; card and
  device fingerprints are stored as hashes only, never a card number. Vouchers become £0 orders through
  `Orders::issueFree`, so their tickets come from Verity like any other.
- Promo ticket cap: voucher tickets + Gimme Box bonus tickets per draw never pass `promo_ticket_cap_pct`
  (default 5%), counted and checked only in `App\Services\PromoCap`, with the competition row locked
  (checkout, voucher redeem). Postal entries are never capped or counted. Players see a neutral notice, never the numbers.
- Never invent winners, reviews or trust figures. Free postal route always visible.
- All dates shown in UK time (`frontend/src/lib/time.ts`).

## Backend (backend/)
- Money moves only through `app/Services`: `Wallet` (ledger), `Orders` (checkout, deposits, gateway sync,
  closing), `Fulfilment` (Verity entries and instant wins), `Postal`. Controllers and the admin
  call these; they never write `wallet_ledger`, `orders.status` or Verity tables themselves.
- `wallet_ledger` and `admin_actions` are append-only (database triggers, `App\Support\LedgerGuards`).
  Every credit has a unique `reference` so repeating an event pays once.
- Every refusal a player can see is a `RefusedException` with a stable `reason` code.
- Never write to `verity_*` tables or edit `vendor/sprouthub/verity-engine` (its fingerprints are checked).
- Competition terms are fixed once published to Verity (`Competition::LOCKED_WHEN_PUBLISHED`).
- Customer accounts are never deleted (model refuses); admin actions carry a reason and are logged.
- Players from the old Lovable site come in only through `gimme:import-lovable` (Admin → Import Players runs it as
  `ImportPlayersJob`): files on the private disk only, a passing check before the import, deleted afterwards.
- The old site's public record (competitions, winners, entry lists) is a read-only archive at `/previous`
  (`archive_*` tables, `gimme:import-archive` from `resources/archive/*.csv` on every deploy; docs/old-site-archive.md).
  Masked names only; never a Verity record, never linked to `/verify`, never mixed into the live lists.
- Busy evenings (504s, 26 Nov 2026): the competition list and a signed-out visitor's competition page are reused for
  `PUBLIC_API_CACHE_SECONDS` (10) from the file cache (`App\Support\PublicCache`; never anything that depends on the player).
  Astro's `serverApi` sends a signed-out visitor's GETs without Origin/Referer (no Laravel session per page view), gives up after
  10s, and a busy API shows `src/pages/500.astro` (503, tries again) instead of a blank error; nginx shows `public/busy.html`.
- Admin is Filament at `/admin` (`app/Filament`); admins and staff can't play.
- Admin reports are read only and share one set of sums, `App\Support\Reports` (player page `Users/Pages/ViewUser`, players list
  balance columns, Wins / Money / Competition reports, dashboard `MoneyStats`, `BigWins`, `TopBuyers`); wins are read from Verity's
  winners, never written. A win at or above `big_win_alert_pence` (Settings, default £100) emails `big_win_alert_emails` (else the
  usual alert address) once, from `Fulfilment` via `App\Support\BigWinAlert`. CSV downloads go through `App\Support\Csv`.
- Tests: `tests/Feature` (Verity runs for real on its local beacon; Cashflows is `FakeGateway`).
- `DemoSeeder` is for laptops and tests only and refuses production.
- Emails are Laravel notifications in the Gimme Gimme mail theme (`resources/views/vendor/mail`, `vendor/notifications/email.blade.php`):
  dark page, neon pink card, yellow button, PNG logo, the 18+ / postal / Safer Play footer. Ticket numbers and money go in
  blocks (`['tickets', …]`, `['rows', …]`), never raw HTML in a line. Subjects in Title Case. `tests/Feature/EmailsTest`
  checks every email; `EMAIL_PREVIEWS=/tmp/gg-emails php artisan test --filter=EmailsTest` writes them out to look at.

## Front end
- Astro drops a space between `{expr}` and a following tag inside `<>…</>`: write `{expr}{" "}<span>`.
- Standalone small links get `class="tap"` (40px tap height).
- Title Case for every title. Mobile first (44px taps, 16px inputs, no sideways scroll at 320px).
- Nothing third-party loads before a cookie choice. The only one is the Meta Pixel (`src/lib/consent.ts`, ID set in
  Admin → Settings), loaded after "Accept" in the cookie banner; its addresses are the only extra ones in the CSP.
  The banner (`src/components/CookieBanner.astro`, 27 Nov 2026) is in the page from the first paint until a choice, one
  sentence, Reject and Accept identical (same size and style, nothing pre-selected), always above the bottom menu and buy
  bar. Choices are counted as daily totals only (`POST /api/consent-choice`, `App\Support\ConsentChoices`, stateless:
  no id, IP, session or cookie), shown in Admin → Meta Tracking Report; `tests/visual/cookie-banner.test.ts` checks it.
- Meta tracking: the banner's choice is copied to a `gg_consent` cookie; only with it does the server keep and send
  events to the Conversions API (`App\Tracking\MetaEvents`, `gimme:meta-events` every minute, token in `META_CAPI_TOKEN`
  only). Browser and server share event ids (order number; `reg-{user id}`). Values are real money only, never bonus.
  Personal details leave only SHA-256 hashed (`MetaTrackingTest`); never log Meta's error message or the token.
  Admin → Reports → Meta Tracking Report (`App\Support\MetaTrackingReport`) lines up site sales against what Meta was sent.
- Smooth games on slow phones: never animate or move anything under a `filter` (drop-shadow, blur), and take a board's
  filter off while it moves (vault, claw, coin drop do). Keep fast-moving parts in their own layer (`will-change: transform`,
  or a separate SVG over the still picture) and `memo` static artwork in boards that re-render every frame.
- Reveal games are 2D (SVG and CSS, no WebGL): each board sits on an illustrated scene (`src/games/arcade/shell/scenery`,
  swappable for a painted picture through `PAINTED`). The classic skin's premium look is `shell/premium.css` plus a
  `.rg-skin-classic` block at the end of each game's CSS. `npm run test:games` plays every game (run the smoothness checks
  alone: `GAMES_WORKERS=1 … -g smoothness`). A new game needs its id in `shared/game-ids.json`, `src/games/gameIds.ts`,
  the admin and presenter labels, and a migration calling `GameIds::replaceDatabaseChecks()`.
- Legal wording loads from `backend/resources/legal/*.html` on deploy (`gimme:legal-pages`) and is then edited in the admin.
- Search: titles, descriptions and structured data come from `src/lib/seo.ts` (titles ≤ 60, descriptions ≤ 155, "Win …" for
  competitions, never a ticket count). Every public page needs its own `title` and `description` on `<Layout>`; private pages
  are `noindex` and left out of `sitemap.xml.ts` / disallowed in `robots.txt.ts`. `tests/e2e/seo.test.ts` checks every sitemap
  page. Google is shut out until the build has `PUBLIC_SEARCH_INDEXING=on` (launch day); `PUBLIC_GOOGLE_SITE_VERIFICATION` adds
  Search Console's tag.
- Redirects after sign-in go through `safeNext` (`src/lib/safe.ts`).
- Astro trusts Host / X-Forwarded-* only for `allowedDomains` in `astro.config.mjs`; the build must
  have `PUBLIC_SITE_URL` set to the live address or form posts are refused.
