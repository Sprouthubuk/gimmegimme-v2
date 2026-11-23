# Prize boosts

Extra instant prizes added to a live instant-win competition after it went on sale (owner, 23 Nov 2026).
Verity's own prize table is fixed at publish and is **never touched**: every original prize and winning number
stays exactly as it was. The added prizes sit beside it (`boost_prizes`), each on its own ticket number, and are
paid by the site the moment that ticket is issued (`App\Services\PrizeBoosts::settle`, called by `Fulfilment` and
`Postal` in the same transaction as Verity issues the tickets). They are not part of Verity's own fair-play record;
this page and `GET /api/competitions/{slug}/prize-boost` are their public record.

## Running one

The list lives in `backend/resources/boosts/{batch}.php` (tiers biggest first: quantity, value in pence, name).

```
php artisan competitions:boost-prizes --batch=2026-11-23 --dry-run   # figures only, changes nothing
php artisan competitions:boost-prizes --batch=2026-11-23             # adds them (each competition once)
php artisan competitions:boost-prizes --batch=2026-11-23 --verify    # re-checks what was added
```

Every run's output is also saved under `storage/app/private/boosts/` and shown in Admin → Reports → Prize Boosts.
Running it again adds nothing: a competition that already has the batch is skipped.

## How the numbers are chosen (GG-BOOST-1)

For each competition, in one database transaction:

1. Verity's competition row is locked with the same lock Verity takes to issue tickets, so no ticket can be
   issued (no checkout can complete) while this runs. It is held for a few seconds, at most 25.
2. **Left-out numbers** = every ticket number already issued, plus Verity's own winning numbers. Nobody holds a
   number before paying: Verity hands out numbers only when a payment is confirmed, so a basket or a payment in
   progress holds no number. **Candidates** = 1..max_tickets without the left-out numbers, ascending.
3. A drand quicknet round that has not happened yet is chosen (after drand's latest round, at least 4 seconds
   ahead), and its randomness `R` (32 bytes, BLS-verified) is fetched once it is published.
4. HMAC_DRBG (NIST SP 800-90A, the same `HmacDrbg` as Verity) with entropy = `R`,
   nonce = SHA-256(`"GG-BOOST-1|nonce|" + verityRef + "|" + batch`), personalisation = `"GG-BOOST-1|" + verityRef + "|" + batch`.
   Verity's `Sampler::firstK(drbg, count(candidates), k)` (Fisher–Yates, no modulo bias) gives k positions; slot s
   (the prizes in list order, biggest first) gets `candidates[position s]`.
5. The chosen numbers are checked again against issued tickets and Verity's numbers, Verity's prize table is
   fingerprinted before and after (it must not change), and the prizes and the record are saved. If anything
   fails, nothing is added.

The record keeps the round, `R`, its signature, the left-out numbers (and SHA-256 fingerprints of them and of the
issued numbers). With `GET /api/competitions/{slug}/prize-boost` anyone can rebuild the candidates, re-run step 4
and get the same numbers. `boost_prizes` and `prize_boosts` refuse deletes; a prize's number, value and name
never change, and its winner is set once.
