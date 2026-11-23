# Prize boosts

Extra instant prizes added to a live instant-win competition after it went on sale (owner, 23 Nov 2026). They are
added **by Verity itself** (verity-v3.2.0, spec §17 "VERITY-ADD-1", `Verity::addInstantPrizes`): nothing that is
already there changes, the new winning numbers are drawn by Verity from tickets nobody holds, and everything is on
Verity's audit chain and in its public verification record, checked by the verify page like the rest.

## Running one

The list lives in `backend/resources/boosts/{batch}.php` (tiers biggest first: quantity, value in pence, name).

```
php artisan competitions:boost-prizes --batch=2026-11-23 --dry-run   # figures only, changes nothing
php artisan competitions:boost-prizes --batch=2026-11-23             # Verity adds them (each competition once)
php artisan competitions:boost-prizes --batch=2026-11-23 --verify    # re-checks what was added
```

Every run's output is also saved under `storage/app/private/boosts/` and shown in Admin → Reports → Prize Boosts.
Running it again adds nothing: a competition whose Verity additions already include the batch's reason is skipped.

## What Verity does (spec §17)

1. **Commit.** With the competition locked (the lock every ticket issue takes), Verity fixes the numbers it leaves
   out (every ticket sold and every winning number so far), the prize list and a drand round that hasn't happened
   yet, and writes them to its audit chain (`instant.prizes_committed`). Sales carry on.
2. **Seal.** Once the round is out (BLS-verified), with the competition locked again, tickets sold in between are left
   out too (the "window"), and the new numbers are drawn with Verity's own HMAC_DRBG and Fisher–Yates sampler from the
   numbers nobody holds. The prizes and numbers are written and `instant.prizes_added` goes on the chain. If the round
   isn't out within 45 seconds, `verity:process-due` seals it within a minute.
3. A ticket sold later on an added number is linked to its prize when Verity issues it and is won through the usual
   `play()`, so `Fulfilment` pays it like any other instant win (winnings, reference `verity-winner:{id}`).

Database guards refuse anything else: no prize or number can be added outside an open addition, none on a sold
ticket, none changed or removed afterwards. Verity's public record lists each addition; the numbers it left out are
published at the draw (they include the original winning numbers, which are secret until then), and the browser,
PHP and Python verifiers re-derive every added number.
