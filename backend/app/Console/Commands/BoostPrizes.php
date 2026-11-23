<?php

namespace App\Console\Commands;

use App\Filament\Support\Money;
use App\Models\Competition;
use App\Models\LedgerEntry;
use App\Models\PrizeBoost;
use App\Services\PrizeBoosts;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Sprouthub\Verity\Models\Entry;

/**
 * Adds a batch of extra instant prizes (resources/boosts/{batch}.php) to live instant-win competitions
 * (App\Services\PrizeBoosts). --dry-run changes nothing and shows the figures. Running it again adds nothing
 * twice: a competition that already has the batch is skipped. Every run's output is also saved to
 * storage/app/private/boosts/ (Forge's command output can go missing).
 */
class BoostPrizes extends Command
{
    protected $signature = 'competitions:boost-prizes {--batch=2026-11-23} {--dry-run} {--verify : check boosts already added} {--only= : one competition slug}';

    protected $description = 'Add extra instant prizes to live instant-win competitions (prize boost)';

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
            $r = $boosts->report($c, $tiers, $batch);
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
            $lines[] = sprintf('  Unsold numbers free to use: %s', number_format($r['eligible']));
            if ($r['endPrizePence']) {
                $lines[] = '  End prizes (unchanged): '.Money::show($r['endPrizePence']);
            }
            if ($r['problem'] !== null) {
                $lines[] = '  SKIP: '.$r['problem'];
                $failed = $failed || $r['problem'] !== 'already added';

                continue;
            }
            if ($r['eligible'] < $r['addCount']) {
                $lines[] = '  SKIP: not enough unsold numbers';
                $failed = true;

                continue;
            }
            if ($dry) {
                $lines[] = '  Ready to add.';

                continue;
            }
            try {
                $res = $boosts->apply($c, $tiers, $batch, $plan['reason']);
            } catch (\Throwable $e) {
                $res = 'FAILED, nothing added for this competition: '.$e->getMessage();
            }
            if (! $res instanceof PrizeBoost) {
                $lines[] = '  SKIP: '.$res;
                $failed = $failed || $res !== 'already added';

                continue;
            }
            $totals['count'] += $res->prize_count;
            $totals['value'] += $res->value_pence;
            $lines[] = sprintf('  ADDED %d prizes · drand round %s · randomness %s · %d numbers left out (issued %d)', $res->prize_count, $res->beacon_round ?? $res->beacon_source,
                substr($res->beacon_randomness, 0, 16).'…', $res->excluded_count, $res->issued_count);
            $lines[] = '  Verity prize table unchanged: '.substr($res->verity_table_hash, 0, 16).'…';
        }
        if (! $dry) {
            $lines[] = '';
            $lines[] = 'Added in this run: '.$totals['count'].' prizes worth '.Money::show($totals['value']);
        }
        $text = implode("\n", $lines);
        foreach ($lines as $line) {
            $this->line($line);
        }
        Storage::disk('local')->put('boosts/'.$batch.'-'.($dry ? 'dry-run' : 'run').'-'.now()->format('Ymd-His').'.txt', $text);

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    /**
     * For every boost already added: the numbers re-derive from the public record, Verity's prizes and numbers are
     * unchanged since, and no added number had been issued before it was added.
     */
    private function verify(string $batch, array $plan): int
    {
        $lines = ['VERIFY · batch '.$batch.' · '.now('Europe/London')->format('j M Y H:i:s').' UK'];
        $ok = true;
        foreach (array_keys($plan['competitions']) as $slug) {
            if ($this->option('only') && $this->option('only') !== $slug) {
                continue;
            }
            $c = Competition::query()->where('slug', $slug)->first();
            $b = $c ? PrizeBoost::query()->where('competition_id', $c->id)->where('batch', $batch)->first() : null;
            if (! $b) {
                $lines[] = "{$slug}: not added";

                continue;
            }
            $v = \Sprouthub\Verity\Models\Competition::query()->where('ref', $c->verity_ref)->firstOrFail();
            $stored = $b->prizes()->orderBy('slot')->pluck('ticket_number')->map(fn ($n) => (int) $n)->all();
            $same = PrizeBoosts::rederive($b, (string) $v->ref) === $stored;
            $untouched = PrizeBoosts::verityTableHash($v->id) === $b->verity_table_hash;
            $early = Entry::query()->where('competition_id', $v->id)->whereIn('number', $stored)->where('created_at', '<', $b->added_at)->count();
            $clash = DB::table('verity_instant_tickets')->where('competition_id', $v->id)->whereIn('ticket_number', $stored)->count();
            $won = $b->prizes()->whereNotNull('won_at')->count();
            $paid = LedgerEntry::query()->whereIn('reference', $b->prizes()->whereNotNull('won_user_id')->pluck('id')->map(fn ($id) => 'boost-prize:'.$id))->count();
            $wonByUser = $b->prizes()->whereNotNull('won_user_id')->count();
            $good = $same && $untouched && $early === 0 && $clash === 0 && $paid === $wonByUser;
            $ok = $ok && $good;
            $lines[] = sprintf('%s %s: numbers re-derive %s · Verity table unchanged %s · sold before the boost %d · on a Verity number %d · won %d/%d · paid %d/%d',
                $good ? 'OK  ' : 'FAIL', $slug, $same ? 'yes' : 'NO', $untouched ? 'yes' : 'NO', $early, $clash, $won, $b->prize_count, $paid, $wonByUser);
        }
        foreach ($lines as $line) {
            $this->line($line);
        }
        Storage::disk('local')->put('boosts/'.$batch.'-verify-'.now()->format('Ymd-His').'.txt', implode("\n", $lines));

        return $ok ? self::SUCCESS : self::FAILURE;
    }
}
