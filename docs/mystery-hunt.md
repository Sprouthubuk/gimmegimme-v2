# Mystery Hunt

A reusable, themeable instant-win format (owner, 26 Nov 2026). The first one is **The Christmas Bauble Hunt**
(`php artisan gimme:bauble-hunt-draft --closes="YYYY-MM-DD HH:MM" --facebook=<group link>`).

## How it works

1. **Theme** (Admin → Competitions → Hunt Themes): the symbol's name ("Mystery Bauble"), hashtag, Facebook group,
   artwork, colours and the intro line. Duplicate a theme to make the next hunt.
2. **Competition**: an instant-win game with that theme, one instant prize of type **Hunt symbol** (£0) with as many
   as you want hidden, and the **prizes hidden behind the symbols** (cash or ticket credit) adding up to the same number.
   The admin form shows the prize fund, cash against credit, the odds and the break-even as you type.
3. **Publish**: Verity fixes the instant-win table as usual *and* seals a separate hunt map, which prize is behind
   each number 1 … N, from a seed of its own (spec §18, verity-v3.3.0). Only its fingerprint is public. Nobody can see
   the map, admins included.
4. **A ticket wins a symbol**: nothing is paid yet. The player gets an email ("Mystery Bauble Found: Pick Your Number")
   with the claim steps and a deadline (48 hours, set per competition), and a reminder 12 hours before it.
5. **The player picks a number** in the Facebook group (with the hashtag and their ticket number), or by email or the
   contact form if they're not on Facebook.
6. **An admin opens it**: Admin → Competitions → (the hunt) → **Hunt Board** → **Open a Number** on that find, choose
   the number and how they claimed. Verity reveals only that prize; it's paid at once (cash to winnings, ticket credit to
   bonus with the usual expiry) and the player is emailed. The number is taken on the public board with their masked name.
7. **Not claimed in time**: the find isn't won. Its number stays free.
8. **The hunt ends** after the close, one more claim window and no find still waiting: `hunts:tick` (every 5 minutes)
   has Verity publish the seed. The board then shows every number's prize, won or not, and anyone can check it against
   the fingerprint on the fair-play record.

## Money

- Symbols nobody claims aren't won, so the fund shown in the admin is the most that can be paid.
- The Christmas Bauble Hunt: 20p × 7,500 = £1,500 at sell-out; prize fund £387 (cash £305 incl. the £100 end prize,
  credit £82); 212 instant wins (1 in 35); break-even about 1,935 tickets, about 2,050 with card fees.
- Bonus credit can now pay for a whole basket (the half-basket rule was removed on 26 Nov 2026).

## Terms clause (to paste into the admin)

> **Mystery Hunts.** Some instant-win competitions include symbols (for example a "Mystery Bauble"). A ticket that wins a
> symbol does not win a prize by itself: its holder may choose one number on that competition's Hunt Board that nobody
> has chosen, and wins the prize behind it. Which prize is behind each number is fixed by our draw engine before any
> ticket is sold and published, with its fingerprint, when the hunt ends. To claim, tell us your chosen number and your
> ticket number, in our Facebook group or by email or the contact form (you do not need Facebook), within the time stated
> on the competition page (48 hours unless stated otherwise) from when the symbol was won. A symbol not claimed in time is
> not won and its prize is not awarded. Cash prizes are paid to your winnings; ticket credit can be spent on tickets only
> and expires on the date shown in your wallet. A number already chosen cannot be chosen again.
