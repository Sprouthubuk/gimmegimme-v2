# Overnight log — Gimme Box + Refer a Friend (19 Nov 2026)

Branch `feature/gimme-box-referrals`, based on `chore/flexstyle-title` (PR #32, not merged when this run started).

## Summary
_(filled in at the end)_

## Needs Liam
_(filled in as the run goes)_

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
