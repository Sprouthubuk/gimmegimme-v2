<?php

namespace App\Services;

use App\Models\Competition;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Sprouthub\Verity\Facades\Verity;
use Sprouthub\Verity\Models\InstantAddition;

/**
 * Prize boosts (owner, 23 Nov 2026): extra instant prizes for live instant-win competitions, added by Verity
 * itself (verity-v3.2.0, spec §17, Verity::addInstantPrizes). Verity commits to the numbers it leaves out and a
 * drand round still to come, then draws the new winning numbers only from tickets nobody holds; the original
 * table, its prizes and every ticket sold stay exactly as they are, and it's all on Verity's audit chain and in its
 * public verification record. A ticket sold on an added number is an ordinary Verity instant win, so Fulfilment
 * plays and pays it like any other. The lists live in resources/boosts/{batch}.php; one addition per competition
 * per batch (matched on the batch's reason), so running it again adds nothing.
 */
final class PrizeBoosts
{
    public function __construct(private CompetitionState $state) {}

    /** @return array{reason: string, competitions: array<string, list<array{0:int,1:int,2:string}>>} */
    public static function batch(string $batch): array
    {
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $batch) || ! is_file($file = resource_path("boosts/{$batch}.php"))) {
            throw new RuntimeException("No prize boost list for {$batch} (resources/boosts/{$batch}.php).");
        }

        return require $file;
    }

    /** This batch's Verity addition for a competition, if it has one (any status). */
    public function existing(Competition $c, string $reason): ?InstantAddition
    {
        $v = $this->state->verity($c);

        return $v ? InstantAddition::query()->where('competition_id', $v->id)->where('reason', $reason)->orderBy('number')->first() : null;
    }

    /** Why a competition can't be boosted now, or null. */
    public function problem(Competition $c, string $reason): ?string
    {
        $v = $this->state->verity($c);
        if ($a = $this->existing($c, $reason)) {
            return $a->status === 'committed' ? 'already started: waiting for its drand round (process-due seals it)' : 'already added';
        }
        if (! $c->isInstant() || ! $v || $v->instant_table_hash === null) {
            return 'not a published instant-win competition';
        }
        if (! in_array($v->status, ['live', 'paused'], true) || ! $c->closes_at || $c->closes_at->isPast() || $c->ended_at !== null) {
            return 'not on sale (status '.$v->status.')';
        }

        return null;
    }

    /** Figures before and after, read only. */
    public function report(Competition $c, array $tiers, string $reason): array
    {
        $v = $this->state->verity($c);
        $max = (int) $c->max_tickets;
        $prizes = $v ? DB::table('verity_instant_prizes')->where('competition_id', $v->id)->get(['value_pence', 'quantity']) : collect();
        $oldCount = (int) $prizes->sum('quantity');
        $oldValue = (int) $prizes->sum(fn ($p) => (int) $p->value_pence * (int) $p->quantity);
        $addCount = array_sum(array_map(fn ($t) => (int) $t[0], $tiers));
        $addValue = array_sum(array_map(fn ($t) => (int) $t[0] * (int) $t[1], $tiers));
        $revenue = $max * (int) $c->price_pence;
        $end = (int) $c->end_prize_value_pence * $c->endPrizeCount();
        $existing = $this->existing($c, $reason);
        if ($existing && $existing->status === 'sealed') { // already in the figures above
            $oldCount -= $addCount;
            $oldValue -= $addValue;
        }
        $taken = $v ? DB::table('verity_entries')->where('competition_id', $v->id)->pluck('number')
            ->merge(DB::table('verity_instant_tickets')->where('competition_id', $v->id)->pluck('ticket_number'))->unique()->count() : 0;
        $pct = fn (int $value) => $revenue ? round(100 * $value / $revenue, 1) : 0.0;
        $perPound = fn (int $count) => $max && (int) $c->price_pence ? round(100 * (100 / (int) $c->price_pence) * $count / $max, 1) : null;

        return [
            'slug' => $c->slug, 'title' => $c->title, 'status' => $this->state->status($c),
            'maxTickets' => $max, 'sold' => $v ? (int) $v->tickets_sold : 0, 'pricePence' => (int) $c->price_pence, 'sellOutPence' => $revenue,
            'oldCount' => $oldCount, 'oldValuePence' => $oldValue, 'addCount' => $addCount, 'addValuePence' => $addValue,
            'newCount' => $oldCount + $addCount, 'newValuePence' => $oldValue + $addValue,
            'oldPct' => $pct($oldValue), 'newPct' => $pct($oldValue + $addValue), 'oldPctAll' => $pct($oldValue + $end), 'newPctAll' => $pct($oldValue + $addValue + $end),
            'oddsOld' => $oldCount ? round($max / $oldCount, 1) : null, 'oddsNew' => ($oldCount + $addCount) ? round($max / ($oldCount + $addCount), 1) : null,
            'perPoundOld' => $perPound($oldCount), 'perPoundNew' => $perPound($oldCount + $addCount),
            'endPrizePence' => $end, 'free' => max(0, $max - $taken), 'problem' => $this->problem($c, $reason), 'existing' => $existing,
        ];
    }

    /** Add one competition's prizes through Verity. Returns the addition, or why it was skipped. */
    public function apply(Competition $c, array $tiers, string $reason): InstantAddition|string
    {
        if (($why = $this->problem($c, $reason)) !== null) {
            return $why;
        }
        $prizes = [];
        foreach ($tiers as [$qty, $value, $name]) {
            if ((int) $qty < 1 || (int) $value < 1 || trim((string) $name) === '') {
                throw new RuntimeException("Bad prize line for {$c->slug}.");
            }
            // Site credit, paid to winnings like every other cash instant prize (Fulfilment::awardInstantWin).
            $prizes[] = ['name' => trim((string) $name), 'quantity' => (int) $qty, 'value_pence' => (int) $value, 'meta' => ['type' => 'site_credit']];
        }

        return Verity::addInstantPrizes($c->verity_ref, $prizes, $reason, 'gimme:boost-prizes', 45);
    }
}
