# Moving players from the Lovable site

`php artisan gimme:import-lovable <folder>` reads two CSV files and creates (or updates) the players
and their wallet balances. It is safe to run more than once and ends by checking the balances it
read equal the balances now in the wallet. Run it with `--dry-run` first: that checks every row
and writes nothing.

Existing passwords keep working: the bcrypt hash from the old sign-in system is carried across, so
nobody has to reset. Safer-play settings carry over and only ever get stricter on a re-run.

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
       p.sms_marketing_opt_in                      as marketing_sms,
       (u.email_confirmed_at is not null)          as email_confirmed,
       u.encrypted_password                        as password_hash,
       l.self_excluded_until, l.cool_off_until,
       round(l.weekly_limit * 100)::int            as weekly_limit_pence,
       p.is_staff,
       exists (select 1 from user_roles r where r.user_id = p.user_id and r.role = 'admin') as is_admin,
       public.is_account_suspended(p.user_id)      as on_hold,
       public.is_identity_verified(p.user_id)      as id_verified,
       p.created_at
from profiles p
join auth.users u on u.id = p.user_id
left join user_limits l on l.user_id = p.user_id
where p.closed_at is null;  -- drop this line if the column doesn't exist
```

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

`balances.csv` needs `legacy_id`, `deposit_pence`, `bonus_pence`, `winnings_pence` (whole pence);
`bonus_expires_at` is optional (30 days from the import otherwise).

## What isn't moved

Orders, tickets and past winners stay on the old site's records: Verity starts with an empty,
verifiable history, and the old site's competitions should all be drawn or ended before switching.
Keep a database backup of the old site.
