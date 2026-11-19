<?php

namespace App\Services;

use App\Models\Competition;
use Random\Engine\Mt19937;
use Random\Engine\Secure;
use Random\Randomizer;

/**
 * Packs a Gimme Box: a budget spread over 2–4 live draws, priced only with the competition page's own
 * bundle and single-ticket prices (App\Services\Bundles), plus a stated percentage of free bonus tickets.
 * Nothing here is shown to the player until the server has priced it; the browser sends only budget + mode.
 */
final class GimmeBoxPacker
{
    public const MODES = ['surprise', 'big', 'most'];

    public function __construct(private CompetitionState $state, private Bundles $bundles) {}

    /**
     * Draws a box may use now, with their weights for $mode and how many tickets each can still take.
     *
     * @return list<array{c: Competition, weight: float, room: int}>
     */
    public function eligible(string $mode, ?int $userId = null): array
    {
        $maxSold = Settings::bounded('gimme_box_max_sold_pct', 0, 100);
        $boost = Settings::bounded('gimme_box_slow_boost_pct', 100, 1000) / 100;
        $out = [];
        $draws = Competition::query()->published()->with('bundleTiers')->where('type', 'draw')->where('gimme_box_enabled', true)
            ->where('gimme_box_weight', '>', 0)->where('closes_at', '>', now()->addHour())->orderBy('id')->get();
        foreach ($draws as $c) {
            if ($this->state->status($c) !== 'live' || $this->state->soldPercent($c) > $maxSold) {
                continue;
            }
            $owner = $userId ? 'user:'.$userId : null;
            $room = $owner ? $this->state->canBuy($c, $owner) : max(0, $this->state->left($c) - $this->state->reserved($c));
            if ($room < 1) {
                continue;
            }
            $w = (float) $c->gimme_box_weight * $this->modeFactor($c, $mode, $room);
            if ($this->slowSelling($c)) {
                $w *= $boost;
            }
            $out[] = ['c' => $c, 'weight' => $w, 'room' => $room];
        }

        return $out;
    }

    /**
     * @return array{lines: list<array{competition: Competition, bundle: ?array, paid: int, free: int, bonus: int, linePence: int}>, totalPence: int, unusedPence: int}
     */
    public function pack(int $budget, string $mode, ?int $userId = null, ?int $seed = null): array
    {
        $rand = new Randomizer($seed === null ? new Secure : new Mt19937($seed));
        $pool = $this->eligible($mode, $userId);
        $empty = ['lines' => [], 'totalPence' => 0, 'unusedPence' => $budget];
        if ($pool === []) {
            return $empty;
        }
        // How many draws: 2–4 (settings); a small budget (under £10) takes 1–2.
        $min = Settings::bounded('gimme_box_min_draws', 1, 10);
        $max = max($min, Settings::bounded('gimme_box_max_draws', 1, 10));
        if ($budget < 1000) {
            [$min, $max] = [1, min(2, $max)];
        }
        $n = min(count($pool), $rand->getInt($min, $max));
        $chosen = $this->pickWeighted($pool, $n, $rand);
        // Cheapest draws last, so leftovers are mopped up by the cheapest single tickets.
        usort($chosen, fn ($a, $b) => $b['c']->price_pence <=> $a['c']->price_pence);

        $lines = [];
        $left = $budget;
        foreach ($chosen as $i => $d) {
            $share = intdiv($left, count($chosen) - $i); // an even split of what's left
            $line = $this->buy($d['c'], $d['room'], $share, $mode);
            if ($line['paid'] > 0) {
                $lines[] = $line + ['room' => $d['room']];
                $left -= $line['linePence'];
            }
        }
        // Leftovers: more single tickets in the chosen draws, cheapest first, never over budget.
        foreach (array_reverse(array_keys($lines)) as $k) {
            $l = &$lines[$k];
            $price = $l['competition']->price_pence;
            $extra = min(intdiv($left, $price), $l['room'] - $l['paid'] - $l['free']);
            if ($extra > 0) {
                $l['paid'] += $extra;
                $l['singles'] += $extra;
                $l['linePence'] += $extra * $price;
                $left -= $extra * $price;
            }
            unset($l);
        }
        if ($lines === []) {
            return $empty;
        }

        $pct = Settings::bounded('gimme_box_bonus_pct', 0, 100);
        $out = [];
        foreach ($lines as $l) {
            $c = $l['competition'];
            $tickets = $l['paid'] + $l['free'];
            $bonus = intdiv($tickets * $pct, 100);
            // Never past what's left, nor past the competition's biggest-bundle share.
            $bonus = max(0, min($bonus, $l['room'] - $tickets, max(0, Bundles::shareLimit($c) - $tickets)));
            // The draw's promo ticket cap: once reached, the box still sells paid tickets but adds no bonus.
            $capped = $bonus > PromoCap::room($c);
            $bonus = min($bonus, PromoCap::room($c));
            $out[] = ['competition' => $c, 'bundle' => $l['bundle'], 'singles' => $l['singles'], 'paid' => $l['paid'], 'free' => $l['free'], 'bonus' => $bonus, 'linePence' => $l['linePence'],
                'notice' => $capped ? PromoCap::FULL_MESSAGE : null];
        }

        return ['lines' => $out, 'totalPence' => $budget - $left, 'unusedPence' => $left];
    }

    /** The biggest bundle that fits the share (Bundles decides what's on sale), then single tickets. */
    private function buy(Competition $c, int $room, int $share, string $mode): array
    {
        $bundle = null;
        foreach (array_reverse($this->bundles->available($c, $room)) as $b) {
            if ($b['paid'] * $c->price_pence <= $share) {
                $bundle = $b;
                break;
            }
        }
        $paid = $bundle['paid'] ?? 0;
        $free = $bundle['free'] ?? 0;
        $spent = $paid * $c->price_pence;
        $singles = max(0, min(intdiv($share - $spent, $c->price_pence), $room - $paid - $free));

        return ['competition' => $c, 'bundle' => $bundle ? ['id' => $bundle['tier']->id, 'label' => $bundle['label'], 'paid' => $paid, 'free' => $free] : null,
            'singles' => $singles, 'paid' => $paid + $singles, 'free' => $free, 'linePence' => $spent + $singles * $c->price_pence];
    }

    private function modeFactor(Competition $c, string $mode, int $room): float
    {
        return match ($mode) {
            'big' => max(1, (int) $c->end_prize_value_pence) / 10000,             // in proportion to the prize value
            'most' => 100 / max(0.01, $this->bestPencePerTicket($c, $room)),        // the cheaper per ticket, the more weight
            default => 1.0,
        };
    }

    /** The lowest effective price per ticket on offer: the biggest bundle that fits, or a single ticket. */
    private function bestPencePerTicket(Competition $c, int $room): float
    {
        $best = (float) $c->price_pence;
        foreach ($this->bundles->available($c, $room) as $b) {
            $best = min($best, $b['paid'] * $c->price_pence / $b['total']);
        }

        return $best;
    }

    /** Behind where it should be: less sold than the share of its selling time that has passed. */
    private function slowSelling(Competition $c): bool
    {
        $start = $c->opens_at ?? $c->published_at;
        if (! $start || ! $c->closes_at || $c->closes_at->lte($start)) {
            return false;
        }
        $elapsed = max(0, min(1, ($start->diffInSeconds(now())) / max(1, $start->diffInSeconds($c->closes_at))));

        return $this->state->soldPercent($c) < $elapsed * 100;
    }

    /**
     * @param  list<array{c: Competition, weight: float, room: int}>  $pool
     * @return list<array{c: Competition, weight: float, room: int}>
     */
    private function pickWeighted(array $pool, int $n, Randomizer $rand): array
    {
        $picked = [];
        while (count($picked) < $n && $pool !== []) {
            $sum = array_sum(array_column($pool, 'weight'));
            $x = $rand->getFloat(0, $sum > 0 ? $sum : 1);
            foreach ($pool as $k => $d) {
                $x -= $sum > 0 ? $d['weight'] : 1;
                if ($x <= 0 || $k === array_key_last($pool)) {
                    $picked[] = $d;
                    unset($pool[$k]);
                    break;
                }
            }
            $pool = array_values($pool);
        }

        return $picked;
    }
}
