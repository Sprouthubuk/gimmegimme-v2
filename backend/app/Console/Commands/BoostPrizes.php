<?php

namespace App\Console\Commands;

use App\Filament\Support\Money;
use App\Models\Competition;
use App\Services\PrizeBoosts;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Sprouthub\Verity\Models\InstantAddition;
use Sprouthub\Verity\Support\DrawReverify;
use Sprouthub\Verity\Support\InstantAdditionTable;

/**
 * Adds a batch of extra instant prizes (resources/boosts/{batch}.php) to live instant-win competitions through
 * Verity (App\Services\PrizeBoosts, Verity::addInstantPrizes). --dry-run changes nothing and shows the figures;
 * --verify re-checks what was added. Running it again adds nothing. Every run's output is also saved under
 * storage/app/private/boosts/ and shown in Admin → Reports → Prize Boosts (Forge's command output can go missing).
 */
class BoostPrizes extends Command
{
    protected $signature = 'competitions:boost-prizes {--batch=2026-11-23} {--dry-run} {--verify : check boosts already added} {--only= : one competition slug}';

    protected $description = 'Add extra instant prizes to live instant-win competitions, through Verity (prize boost)';

    public function handle(PrizeBoosts $boosts): int
    {
        $batch = (string) $this->option('batch');
        $plan = PrizeBoosts::batch($batch);
        if ($this->option('verify')) {
            return $this->verify($batch, $plan);
        }
        $dry = (bool) $this->option('dry-run');
        $lines = [($dry ? 'DRY RUN (nothing changes) · ' : 'ADDING · ').'batch '.$batch.' · '.$plan['reason'].' · '.now('Europe/London')->format('j M Y H:i:s').' UK'];
        $failed = false;
        $totals = ['count' => 0, 'value' => 0];
        foreach ($plan['competitions'] as $slug => $tiers) {
            if ($this->option('only') && $this->option('only') !== $slug) {
                continue;
            }
            $c = Competition::query()->where('slug', $slug)->first();
            if (! $c) {
                $lines[] = "\n{$slug}: NOT FOUND";
                $failed = true;

                continue;
            }
            $r = $boosts->report($c, $tiers, $plan['reason']);
            $lines[] = '';
            $lines[] = "{$r['title']} ({$slug}) · {$r['status']}";
            $lines[] = sprintf('  Max tickets %s · sold %s · price %s · sell-out %s', number_format($r['maxTickets']), number_format($r['sold']), Money::show($r['pricePence']), Money::show($r['sellOutPence']));
            $lines[] = sprintf('  Instant prizes now: %s worth %s (%s%% of sell-out) · odds 1 in %s', number_format($r['oldCount']), Money::show($r['oldValuePence']), $r['oldPct'], $r['oddsOld'] ?? '-');
            $lines[] = sprintf('  Adding: %s worth %s', number_format($r['addCount']), Money::show($r['addValuePence']));
            foreach ($tiers as [$q, $v, $n]) {
                $lines[] = sprintf('    %4d × %-8s %s', $q, Money::show($v), $n);
            }
            $lines[] = sprintf('  After: %s instant wins worth %s (%s%% of sell-out) · odds of winning anything 1 in %s', number_format($r['newCount']), Money::show($r['newValuePence']), $r['newPct'], $r['oddsNew'] ?? '-');
            $lines[] = sprintf('  Chance of a win per £1 spent: %s%% now, %s%% after', $r['perPoundOld'] ?? '-', $r['perPoundNew'] ?? '-');
            $lines[] = sprintf('  All prizes (instant + end): %s%% of sell-out now, %s%% after', $r['oldPctAll'], $r['newPctAll']);
            $lines[] = sprintf('  Ticket numbers nobody holds: %s', number_format($r['free']));
            if ($r['endPrizePence']) {
                $lines[] = '  End prizes (unchanged): '.Money::show($r['endPrizePence']);
            }
            if ($r['problem'] !== null) {
                $lines[] = '  SKIP: '.$r['problem'];
                $failed = $failed || ! str_starts_with($r['problem'], 'already');

                continue;
            }
            if ($r['free'] < $r['addCount']) {
                $lines[] = '  SKIP: not enough unsold numbers';
                $failed = true;

                continue;
            }
            if ($dry) {
                $lines[] = '  Ready to add.';

                continue;
            }
            try {
                $res = $boosts->apply($c, $tiers, $plan['reason']);
            } catch (\Throwable $e) {
                $res = 'FAILED, nothing added for this competition: '.$e->getMessage();
            }
            if (! $res instanceof InstantAddition) {
                $lines[] = '  SKIP: '.$res;
                $failed = $failed || ! str_starts_with($res, 'already');

                continue;
            }
            if ($res->status !== 'sealed') {
                $lines[] = sprintf('  COMMITTED by Verity (addition %d, drand round %s): its round isn\'t out yet; verity:process-due seals it within a minute.', $res->number, $res->beacon_round ?? '-');

                continue;
            }
            $totals['count'] += $r['addCount'];
            $totals['value'] += $r['addValuePence'];
            $lines[] = sprintf('  ADDED by Verity: addition %d · drand round %s · %d numbers left out (sold or already winning) · %d sold during it', $res->number,
                $res->beacon_round ?? $res->beacon_source, $res->excluded_count, (int) $res->window_count);
        }
        if (! $dry) {
            $lines[] = '';
            $lines[] = 'Added in this run: '.$totals['count'].' prizes worth '.Money::show($totals['value']);
        }
        foreach ($lines as $line) {
            $this->line($line);
        }
        Storage::disk('local')->put('boosts/'.$batch.'-'.($dry ? 'dry-run' : 'run').'-'.now()->format('Ymd-His').'.txt', implode("\n", $lines));

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    /**
     * For every addition in the batch: it re-derives from its round (Verity's own derivation), Verity's original table
     * still matches the hash published at launch, and no added number was sold before it was added.
     */
    private function verify(string $batch, array $plan): int
    {
        $boosts = app(PrizeBoosts::class);
        $lines = ['VERIFY · batch '.$batch.' · '.now('Europe/London')->format('j M Y H:i:s').' UK'];
        $ok = true;
        foreach (array_keys($plan['competitions']) as $slug) {
            if ($this->option('only') && $this->option('only') !== $slug) {
                continue;
            }
            $c = Competition::query()->where('slug', $slug)->first();
            $a = $c ? $boosts->existing($c, $plan['reason']) : null;
            if (! $a) {
                $lines[] = "{$slug}: not added";

                continue;
            }
            if ($a->status !== 'sealed') {
                $lines[] = "{$slug}: {$a->status}";
                $ok = $ok && $a->status === 'committed';

                continue;
            }
            $v = $a->competition;
            $stored = $a->tickets()->join('verity_instant_prizes as p', 'p.id', '=', 'verity_instant_tickets.instant_prize_id')->orderBy('verity_instant_tickets.slot')
                ->get(['verity_instant_tickets.ticket_number', 'p.key'])->map(fn ($r) => ['ticket' => (int) $r->ticket_number, 'prize' => (string) $r->key])->all();
            $derived = array_map(fn ($r) => ['ticket' => $r['ticket'], 'prize' => $r['prize']], InstantAdditionTable::table((string) $a->beacon_randomness, $v->ref,
                (int) $a->number, (int) $a->max_tickets, $a->excluded(), $a->window(), array_map(fn ($p) => ['key' => $p['key'], 'quantity' => (int) $p['quantity']], $a->prizes)));
            $same = $stored === $derived;
            $original = hash_equals((string) $v->instant_table_hash, DrawReverify::storedTableHash($v));
            $early = DB::table('verity_entries')->join('verity_entry_groups as g', 'g.id', '=', 'verity_entries.entry_group_id')->where('verity_entries.competition_id', $v->id)
                ->whereIn('verity_entries.number', array_column($stored, 'ticket'))->where('g.created_at', '<', $a->sealed_at)->count();
            $won = DB::table('verity_entries')->where('competition_id', $v->id)->whereIn('instant_ticket_id', $a->tickets()->select('id'))->count();
            $good = $same && $original && $early === 0;
            $ok = $ok && $good;
            $lines[] = sprintf('%s %s: added numbers re-derive %s · original prizes and numbers unchanged %s · sold before being added %d · drand round %s · won so far %d/%d',
                $good ? 'OK  ' : 'FAIL', $slug, $same ? 'yes' : 'NO', $original ? 'yes' : 'NO', $early, $a->beacon_round ?? $a->beacon_source, $won, count($stored));
        }
        foreach ($lines as $line) {
            $this->line($line);
        }
        Storage::disk('local')->put('boosts/'.$batch.'-verify-'.now()->format('Ymd-His').'.txt', implode("\n", $lines));

        return $ok ? self::SUCCESS : self::FAILURE;
    }
}
