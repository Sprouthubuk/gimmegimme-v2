# Moving players from the Lovable site

`php artisan gimme:import-lovable <folder>` reads two CSV files and creates (or updates) the players
and their wallet balances. It is safe to run more than once and ends by checking the balances it
read equal the balances now in the wallet. Run it with `--dry-run` first: that checks every row
and writes nothing.

Existing passwords keep working: the bcrypt hash from the old sign-in system is carried across, so
nobody has to reset. Safer-play settings carry over and only ever get stricter on a re-run.

## The easy way: Admin → Import Players

Upload `players.csv` and `balances.csv` in **Admin → Players & Money → Import Players**, press
**Check files** (a dry run that writes nothing and lists any problem row), take a database backup, then
press **Import players** (type IMPORT). Both run this same command in the background (queue worker), so a big
file can't time out the page. The files sit on the private disk, are deleted after the import and are
removed by daily housekeeping after a day at most. The command below does the same from a shell.

## Getting the files

Ask Lovable to run these two queries on the live database and save each result as CSV (with a
header row). Nothing else is needed. Do it at the moment of switch-over, with sales closed on the
old site, so no balance changes between the export and the import.

**players.csv**

```sql
select p.user_id                                   as legacy_id,
       u.email                                     as email,
       p.full_name                                 as full_name,
       p.date_of_birth                             as date_of_birth,
       p.phone                                     as phone,
       p.address_line1, p.address_line2, p.city, p.postcode,
       p.marketing_opt_in                          as marketing_email,
       p.marketing_opt_in_at                       as marketing_email_at,
       p.sms_marketing_opt_in                      as marketing_sms,
       p.sms_marketing_opt_in_at                   as marketing_sms_at,
       (u.email_confirmed_at is not null)          as email_confirmed,
       u.encrypted_password                        as password_hash,
       l.self_excluded_until, l.cool_off_until,
       round(l.weekly_limit * 100)::int            as weekly_limit_pence,
       p.is_staff,
       exists (select 1 from user_roles r where r.user_id = p.user_id and r.role = 'admin') as is_admin,
       public.is_account_suspended(p.user_id)      as on_hold,
       public.is_identity_verified(p.user_id)      as id_verified,
       p.created_at,
       ca.closed_at                                as closed_at
from profiles p
join auth.users u on u.id = p.user_id
left join user_limits l on l.user_id = p.user_id
left join public.closed_accounts ca on ca.user_id = p.id;
```

Closed accounts are exported too, not filtered out, so the import can see them and check their
balances (see [Closed accounts](#closed-accounts)).

**balances.csv**

```sql
select user_id                                                      as legacy_id,
       round(100 * sum(case when bucket = 'deposit'  then (case when type = 'grant' then amount else -amount end) else 0 end))::int as deposit_pence,
       round(100 * sum(case when bucket = 'bonus'    then (case when type = 'grant' then amount else -amount end) else 0 end))::int as bonus_pence,
       max(case when bucket = 'bonus' and type = 'grant' then expires_at end)                                                         as bonus_expires_at,
       round(100 * sum(case when bucket = 'winnings' then (case when type = 'grant' then amount else -amount end) else 0 end))::int as winnings_pence
from site_credits
group by user_id
having sum(case when type = 'grant' then amount else -amount end) <> 0;
```

Expired bonus should already have been written off by the old site's daily job; if not, run that
job first. A negative balance in any bucket is a problem to sort out by hand before importing — the
import refuses it.

## Columns

`players.csv` needs `legacy_id` and `email`; everything else is optional. `full_name` is split at
the first space if there are no `first_name` / `last_name` columns. True/false columns accept
`true/false`, `t/f`, `1/0` or `yes/no`. Dates are any format PHP reads (ISO 8601 is best).

`marketing_email_at` and `marketing_sms_at` are when the player agreed to each. A date is kept only
while that choice is on, and an empty one stays empty. The old site used the sign-up date in place of a
missing email date when it sent marketing; don't do that in the export: take the column as it is
stored. On the new site the date is set when a player ticks the box, cleared when they
turn it off, and both are cleared when they self-exclude. The admin shows both on the player's page.

`balances.csv` needs `legacy_id`, `deposit_pence`, `bonus_pence`, `winnings_pence` (whole pence);
`bonus_expires_at` is optional (30 days from the import otherwise).

## Closed accounts

A row with a `closed_at` date is a closed account (a row in the old site's `public.closed_accounts`).
The old site has already blanked its name and address, so its details aren't checked.

- It is left out: no account is made here and the import says how many were left out.
- If it still has money in `balances.csv`, the import stops and imports nothing. Sort that balance out
  by hand on the old site first, as with a negative balance.
- If it was brought across by an earlier run and closed on the old site since, the import leaves it as
  it is (the blanked details are not copied over) and names it. Close it in the admin, with a reason:
  the import never closes an account itself.

## What isn't moved

Orders, tickets and past winners stay on the old site's records: Verity starts with an empty,
verifiable history, and the old site's competitions should all be drawn or ended before switching.
Keep a database backup of the old site.
