# Free-to-enter competitions

Owner, 26 Nov 2026. A live draw or an instant win anyone can enter free: one ticket per person.

## Setting one up

1. Admin → Competitions → New, as usual (picture, prizes, closing time, live draw or instant win).
2. In **Terms**, switch on **Free to enter**. The price becomes £0 and tickets per person 1 (both fixed); bundles, the
   Gimme Box and a Mystery Hunt are switched off and can't be used with it.
3. Choose how many free tickets there are in total (**Tickets**), then **Publish**.

## What players see

- Cards and the home page say **FREE**.
- The competition page has **Claim My Free Ticket** in place of the ticket picker (signed out: **Join Free To Claim**).
- Claiming runs the same checks as buying (sales switch, staff can't play, 18+, email confirmed, self-exclusion,
  breaks, account holds) and issues the ticket through Verity, so instant wins, draws, the live draw screen, held
  results, entry lists and the fair-play record all work as for any competition.
- After claiming they land on the order page: an instant win plays there; a draw shows the ticket number.
- One ticket each, enforced on the server with the competition locked. When every ticket is claimed it's Sold Out.
- Free postal entry still applies, as on every competition.

## Rules in the code

`App\Services\FreeEntry::claim` is the only way to get a free ticket (`POST /api/competitions/{slug}/free-entry`), through
`Orders::issueFree` (a £0 order, line source `free_entry`). `Pricing` refuses a free competition in a basket; free
tickets aren't promo tickets (`PromoCap` doesn't count them); no Meta Purchase event is sent.
