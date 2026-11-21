# The old site's archive

The old (Lovable) site's public record, kept so players can still look it up: its competitions, live-draw
winners, instant winners and entry lists. Shown at `/previous` (linked from Winners, Instant Winners and
Entry Lists), read from `/api/archive…` (docs/api.md).

- **Only what the old site showed publicly**: masked names ("Jo B."), the winner's town, prizes and ticket
  numbers. Never a full name, email or address. `gimme:import-archive` refuses the whole import if any name
  doesn't look masked, and leaves out draw winners the old site never announced.
- **Not Verity records.** These draws weren't run through Verity, so the archive never links to `/verify`,
  never calls itself verified, and is never mixed into the live competition lists. Never copy it into a
  `verity_*` table.
- **No ticket counts**, like the live entry lists: pages say only whether there is more.

## How it's loaded

The four CSVs live in `backend/resources/archive/` (`competitions.csv`, `draw_winners.csv`,
`instant_winners.csv`, `entry_lists.csv`). Every deploy runs `php artisan gimme:import-archive`, which does
nothing unless the files changed (`archive_import_hash` setting), checks every row, copies the old pictures
to the public disk (`archive/{slug}.png`, keeping the old address if a copy fails) and writes everything in
one transaction. `--dry-run` checks without writing; `--force` re-imports.

## The export queries (run in Lovable's SQL editor, 21 Nov 2026)

They read the tables directly because Lovable's own AI may not call the site's functions. Each is read-only.

1. competitions.csv

select c.id, c.slug, c.title, c.image_url, c.status, c.category,
       c.ticket_price, c.draw_date, c.entries_sold, c.created_at
from public.competitions c
where c.status in ('active','sold-out','coming-soon','ended')
  and c.id::text not in (
    '6a6e0000-0000-4000-8000-000000000001','6a6e0000-0000-4000-8000-000000000002',
    '6a6e0000-0000-4000-8000-000000000003','6a6e0000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000104',
    '00000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000106',
    '00000000-0000-4000-8000-000000000107','00000000-0000-4000-8000-000000000108',
    '00000000-0000-4000-8000-000000000109',
    '7e570000-0000-4000-8000-000000000001','7e570000-0000-4000-8000-000000000002',
    '7e570000-0000-4000-8000-000000000003')
order by c.draw_date;

2. draw_winners.csv

select w.id, c.slug as competition_slug, c.title as competition_title,
       w.display_name, w.public_town, w.prize_description, w.prize_value,
       w.won_at, w.announced, w.winner_image_url,
       da.winning_ticket_number, da.draw_method, da.draw_performed_at, da.video_timestamp
from public.winners w
join public.competitions c on c.id = w.competition_id
left join public.draw_audits da on da.id = w.draw_audit_id
where c.status in ('active','sold-out','coming-soon','ended')
  and c.id::text not like '6a6e0000-%' and c.id::text not like '7e570000-%'
  and c.id::text not like '00000000-0000-4000-8000-0000000001%'
order by w.won_at;

3. instant_winners.csv

select r.id, c.slug as competition_slug, c.title as competition_title,
       case when pr.full_name is null or btrim(pr.full_name) = '' then 'Winner'
            else split_part(btrim(pr.full_name), ' ', 1)
              || case when position(' ' in btrim(pr.full_name)) > 0
                      then ' ' || left(split_part(btrim(pr.full_name), ' ', 2), 1) || '.' else '' end
       end as winner_display_name,
       btrim(regexp_replace(regexp_replace(p.prize_name, '\s*#\d+\s*$', ''), '\s*\(\d+\)\s*$', '')) as prize_name,
       p.prize_value, p.prize_type, p.winning_ticket_number, r.created_at as won_at
from public.instant_win_results r
join public.instant_win_prizes p on p.id = r.prize_id
join public.competitions c on c.id = r.competition_id
left join public.profiles pr on pr.user_id = r.user_id
where r.is_winner = true
  and lower(p.prize_name) <> 'no prize'
  and c.status in ('active','sold-out','coming-soon','ended')
  and c.id::text not like '6a6e0000-%' and c.id::text not like '7e570000-%'
  and c.id::text not like '00000000-0000-4000-8000-0000000001%'
order by r.created_at;

4. entry_lists.csv

with n as (
  select c.slug as competition_slug, et.ticket_number,
         case when et.postal_entry_id is not null then 'postal' else 'online' end as entry_type,
         btrim(regexp_replace(coalesce(case when et.postal_entry_id is not null then pe.full_name else pr.full_name end, ''), '\s+', ' ', 'g')) as v
  from public.competitions c
  join public.entry_tickets et on et.competition_id = c.id
  left join public.entries e on e.id = et.entry_id and e.competition_id = et.competition_id
  left join public.postal_entries pe on pe.id = et.postal_entry_id and pe.competition_id = et.competition_id
  left join public.profiles pr on pr.user_id = et.user_id
  where c.status in ('active','sold-out','coming-soon','ended')
    and c.id::text not like '6a6e0000-%' and c.id::text not like '7e570000-%'
    and c.id::text not like '00000000-0000-4000-8000-0000000001%'
    and et.voided_at is null
    and ((et.entry_id is not null and e.payment_status = 'completed')
      or (et.postal_entry_id is not null and pe.id is not null))
)
select competition_slug, ticket_number, entry_type,
       case when v = '' then 'Entrant'
            when v ~ '^[^ ]+ [A-Za-z]\.$' then v
            when position(' ' in v) = 0 then v
            else split_part(v, ' ', 1) || ' ' || upper(left(regexp_replace(v, '^.* ', ''), 1)) || '.'
       end as display_name
from n
order by competition_slug, ticket_number;
