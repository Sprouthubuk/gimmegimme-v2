# Overnight log — Gimme Box + Refer a Friend (19 Nov 2026)

Branch `feature/gimme-box-referrals`, based on `chore/flexstyle-title` (PR #32, not merged when this run started).

## Summary
Both features are built, tested and **switched off** (`feature_gimme_box` = 0, `feature_referrals` = 0; Admin → Settings switches them on without a deploy; `/api/site` returns null for both while off, and a full-stack test proves the pages, API and links are all hidden).

- **Gimme Box**: budget chips + slider (£5–£100), three styles, a 2D shaking gift box (tap to skip; no motion with reduced motion), reveal with each draw's tickets, bonus and % sold, the unused change explained, Shake Again, Add To Basket. Home section (under Live Draws), `/gimme-box`, small links on live-draw pages and the basket. Packed and priced only on the server, never over budget, with bonus tickets (10%) added at checkout only while the basket still matches the box.
- **Refer a Friend**: `/r/CODE` share link → join page banner ("Alex invited you…") → reward on the friend's first £5+ real-money order: a 10-ticket voucher each (or bonus credit), used through a "Choose A Draw" picker on Account → Refer A Friend. Fraud checks, review queue, monthly cap (10), 30-day vouchers, 14-day clawback, order-page prompt, email notice. Draft terms ("DRAFT – Liam to review") loaded only with `gimme:legal-pages --drafts`.
- **Admin**: Settings sections for both, per-draw Gimme Box switch and weight, margin preview with bonus tickets issued and the worst case with the bonus, Gimme Box Report, Referrals list with report line and approve / reject (reason, logged).
- **Two live bugs from PR #30 found and fixed** (see step 2): bundles in the basket couldn't be bought (422), and a bundle + singles for one draw in one order lost the singles' tickets.
- Decision 0a written into CLAUDE.md: % sold only wherever a player buys; entry lists and the fair-play record untouched.

| Suite | PR #32 | Now |
| --- | --- | --- |
| Backend (`php artisan test`) | 147 | **184** |
| Front end (`npm test`) | 191 | **198** |
| Full stack | 13 | **14** |
| Visual (4 sizes) | 128 | **136** |

All green, `astro check` 0 errors / 0 warnings, build clean. Nothing was published, deployed, merged, emailed or paid; no competition was touched.

## Needs Liam
1. **Bonus spend order** — the brief said bonus is spent first; CLAUDE.md's wallet rules (deposit → bonus → winnings, bonus pays at most 50% of a basket) are non-negotiable, so I kept them. Referral credit (if you choose credit rewards) follows them.
2. **Bonus expiry** — referral credit uses the existing bonus expiry setting (30 days), not the brief's 90. Change it in Settings → Bonus credit if you want 90 (it applies to all bonus).
3. **"First purchase"** means the friend's first paid ticket order over £0. If that order is under £5 the referral is "Didn't qualify" for good (a later bigger order doesn't count). Say if you'd rather it be "any order within 30 days".
4. **Over the monthly cap** the friend still gets their reward; only the referrer's is skipped (status "Friend only").
5. **Cashflows card token** — I don't know the field Cashflows returns for a card fingerprint. `CashflowsGateway::parse` looks for a token/fingerprint key and stores only an HMAC of it; check one real sandbox answer and tell me the field name. Until then the same-card check works in tests only.
6. **Refunds** — there is no refund or chargeback flow in v2 yet. Clawback fires when a ticket order's status becomes `refunded`, whoever sets it.
7. **Anonymous boxes hold tickets** for 10 minutes and are limited only by the rate limit (20 shakes a minute per IP, and each shake releases the box it replaces). Fine for launch-size draws; worth watching on the Gimme Box Report.
8. **Instant wins are never put in a box** (the brief allowed it as an option). Boxes are live draws only.
9. **Referral terms are a draft** (`backend/resources/legal/referral-terms.html`), never loaded by a normal deploy. Before switching referrals on: get them reviewed, run `php artisan gimme:legal-pages --drafts`, edit in Admin → Pages. The join banner links to `/legal/referral-terms`.
10. **Device id** — the join form keeps a random id in the browser (localStorage `gg-device`, first-party, never shared; only its hash is stored) for the same-device check. I treated it as fraud prevention, not tracking, so it doesn't wait for the cookie banner; the Privacy Policy should mention it before referrals go on.
11. **Accounts are closed, not deleted**, so "deleted account" in the brief means closed: a closed account's code stops working.
12. **The two PR #30 fixes** (step 2) touch live checkout code. They're in this PR; I can split them into their own small PR if you want them merged first.
13. **Upgrading a box line** in the basket (the "Upgrade to …" button) swaps it for a normal bundle, so that line loses its Gimme Box bonus. The basket shows the bonus disappear; I left it rather than hide the upsell.
14. **Demo data has one live draw**, so the Gimme Box shows "needs at least two live draws" on a laptop/staging seeded with DemoSeeder. Staging's five drafts will qualify once published.
15. **Analytics** — Gimme Box and referral events go to the Meta Pixel as custom events (`GimmeBoxShake`, `GimmeBoxAdded`, `ReferralShare`, `VoucherRedeemed`), only after "Accept". There's no other analytics tool in v2.

## Steps

### Step 1 — reading and foundations
- Read CLAUDE.md, Bundles, Pricing, Orders, Wallet, Fulfilment, CompetitionState, AuthController, the admin.
- **Bonus credit already exists** (wallet `bonus` bucket: spend-only, every grant has an expiry, written off by `players:housekeeping`, never withdrawable — withdrawals take winnings only). I reused it instead of adding a second "bonus" balance. Two parts of the brief clash with CLAUDE.md's non-negotiable wallet rules, so I kept the existing rules (see Needs Liam): spend order stays deposit → bonus → winnings (brief: bonus first), and bonus pays at most 50% of a basket.
- Feature flags are settings (`feature_gimme_box`, `feature_referrals`, both `0`), switchable in Admin → Settings without a deploy; `/api/site` returns `gimmeBox`/`referrals` as null while off.

### Step 2 — Gimme Box backend
- `GimmeBoxPacker` (packing, weights, slow-seller boost, bonus %), `GimmeBoxes` (build / hold / release / expire), `gimme_boxes` table, `POST /api/gimme-box`, `POST /api/gimme-box/{id}/added`.
- A box holds its tickets for 10 minutes (setting) through `CompetitionState::boxHolds`, counted with unpaid orders; shaking again releases the old box; checkout ignores the box's own hold.
- Basket lines carry `boxId`; `Pricing` adds the box's bonus tickets only while the basket still holds what the box packed (same bundle, at least its singles) and the box isn't released/paid. Order lines record `bonus_quantity`, `source = gimme_box`, `gimme_box_id`. Bonus tickets are inside the line's quantity, so Verity issues them like any other.
- **Bug found and fixed (from PR #30, live code):** the site's basket sends `quantity: 0` on a bundle line and the server refused it (422) — bundles added to the basket could not be bought. Test added.
- **Bug found and fixed (from PR #30, live code):** an order with a bundle *and* single tickets for the same draw issued only the first line's tickets: Verity returns the first entry group again for a repeated `host_ref` (`order:{id}`). `host_ref` is now `order:{id}:{line}`. Test added. These two fixes matter before any live draw goes on sale; they could be split into their own PR if you want them in sooner.
- The no-ticket-counts test was flaky: it looked for raw numbers like 3940 on the entry-list page, which prints random ticket numbers from 1 to 3947. Per decision 0a entry lists are out of its scope, so that page (and winning numbers) are skipped for the raw-number part only; their keys are still checked.
- Tests: `GimmeBoxTest` (11). Backend 147 → 159.

### Step 3 — Refer a Friend backend tests
- `ReferralsTest` (21): qualifies only on a first £5+ order; bonus credit doesn't count; a postal entry isn't a purchase; same card / device / sign-up IP / address / email pattern each block both sides (and only hashes are stored); a different card is fine; closed accounts and own codes ignored; many friends from one IP go to review and approve works; monthly cap; credit rewards; voucher picker carries no ticket counts; redeem once into a live draw only, not an instant win or someone else's voucher; expiry; clawback before and after a voucher is used. Backend 159 → 180.

### Step 4 — Gimme Box UI
- `GimmeBoxBuilder` island, `/gimme-box`, home section (shown only when `site.gimmeBox.available`), link on live-draw pages, basket link, bonus badge and wording on basket lines ("10 paid + 15 free + 2 Gimme Box bonus = 27 tickets").
- Basket keeps `boxId` on lines (`addBoxLines` replaces the same kind of line for that draw; a made-up box id is dropped). Signed-out players keep the box through join: it lives in the basket and the server still honours its bonus.
- Mock API: boxes, box bonus in pricing, both features on (the real site starts off; `MOCK_FEATURES=off` hides them).

### Step 5 — Refer a Friend UI
- `/r/[code]` (30-day first-party cookie → `/join?ref=`), join banner with the inviter's first name and the reward, `referralCode` + `deviceId` sent at sign-up, Account → Refer A Friend (link, copy, Share sheet or WhatsApp / Email, stats, vouchers with a "Choose A Draw" picker, friends list), order-page prompt after a paid order.
- e2e `box-and-referrals.test.ts` (5) and unit tests for the basket and wording.

### Step 6 — admin
- Settings: Gimme Box and Refer A Friend sections (switches + every number). Competition form: Gimme Box section (in or out, weight); margin preview adds bonus tickets issued and the worst case with the box bonus. Gimme Box Report. Referrals (Marketing) with the review queue first, badge count, approve / reject with a reason (logged), report line on top.
- `GimmeAdminTest` (4). Backend 180 → 184.

### Step 7 — docs and QA
- `docs/api.md` (both features, register fields, `boxId`, `bonusQuantity`), `types.ts`, README sections, CLAUDE.md paragraphs, draft referral terms.
- QA loop: looked at the phone screenshots for `/gimme-box`, `/account/refer`, home, and a mock run through shake → reveal → basket (bonus badge, totals match the box). Fixed: the visual test's "words run together" check flagged "WhatsApp" (added to its allow-list); the mock packer left change bigger than a ticket.
- Visual tests now start the Laravel test site with both features on (`startSite("laravel", { features: true })`); the full-stack test keeps them off and checks they're hidden.
- Clean database: the full-stack and visual suites build a fresh SQLite database from all migrations each run.

## How to test on staging
1. Merge PR #32 first, then this PR; deploy; check the migration ran (Forge deploy log).
2. Both features are off: the home page, `/gimme-box`, `/r/ANYTHING` and Account show nothing new.
3. Admin → Settings → Gimme Box → switch on → Save. Publish (or have) at least two live draws; on a draw you want left out, Admin → competition → Gimme Box → off.
4. Home (under Live Draws) and `/gimme-box`: pick £10, Surprise Me, Shake. Check the total is ≤ £10, the change line, the bonus line, Shake Again gives a different box.
5. Add To Basket → basket shows each line with "+N Bonus"; total matches the box. Check out with a test player's wallet (sales must be open on staging only) → order page and My Tickets show paid + free + bonus tickets.
6. Signed out: shake, add, then Checkout → Join → back to checkout: bonus still there.
7. Admin → Competitions → Gimme Box Report shows the box; the draw's margin preview shows bonus tickets issued.
8. Run `php artisan gimme:legal-pages --drafts` and read `/legal/referral-terms`. Admin → Settings → Refer A Friend → on.
9. Player A: Account → Refer A Friend → copy the link. In a private window open it: the join page says "A invited you". Join as player B (a different email, not A's address), verify the email, buy £5+ by wallet or card.
10. A and B each see a 10-ticket voucher. A: Choose A Draw → pick → Use. The order page shows the 10 tickets. Try again: refused.
11. Same browser for both players → B's referral is "Blocked (same device)" in Admin → Marketing → Referrals. Three friends from one network → the third goes to "Needs review": approve with a reason.
12. Switch both features off again before hand-over unless you mean to launch them.

### 19 Nov (follow-up) — promo ticket cap
- New per-draw setting `promo_ticket_cap_pct` (default 5%, Admin → competition → Gimme Box And Promo Tickets). Referral voucher tickets and Gimme Box bonus tickets are counted together (`PromoCap`: paid orders plus unpaid ones still in their 15-minute hold).
- At the cap: the voucher picker leaves the draw out and redeem refuses it (`voucher_draw`, the existing neutral message); the box packer and the basket add no more bonus but still sell paid tickets, with the line notice "Bonus tickets for this draw have all been given out." Checkout and redeem lock the competition row, so two buyers can't both take the last of the cap.
- Postal entries are not capped or counted (still 1 ticket per envelope).
- Margin preview: "Promo tickets: N of cap M", and the worst case if the whole cap is given away (replaces the bonus-% worst case).
- `PromoCapTest` (6): cap maths and what counts, voucher picker and redeem, box bonus stops at the cap while paid tickets sell, two boxes packed before either is paid, postal unaffected, no cap or count in any response. Backend 184 → 190.
- Needs Liam: the cap is set per draw, so the five drafts got 5% from the migration default. Lowering it after promo tickets were given doesn't take any back; it only stops more.
