<?php

namespace App\Services;

use App\Models\Competition;
use Sprouthub\Verity\Models\Competition as VerityCompetition;
use Sprouthub\Verity\Models\EntryGroup;

/**
 * What a competition looks like right now, read from Verity (which owns sales, closing and the draw)
 * and the host record (which owns the presentation).
 */
final class CompetitionState
{
    /** @var array<string, VerityCompetition|null> */
    private array $verity = [];

    public function verity(Competition $c): ?VerityCompetition
    {
        if (! $c->verity_ref) {
            return null;
        }

        return $this->verity[$c->verity_ref] ??= VerityCompetition::query()->where('ref', $c->verity_ref)->first();
    }

    /** scheduled | live | sold_out | closed | drawn | ended */
    public function status(Competition $c): string
    {
        $v = $this->verity($c);
        if (! $v || $v->status === 'draft' || ($c->opens_at && $c->opens_at->isFuture())) {
            return 'scheduled';
        }
        if ($c->ended_at !== null || $v->status === 'void') {
            return 'ended';
        }
        if ($v->status === 'drawn') {
            return $c->hasDraw() ? 'drawn' : 'ended';
        }
        if (in_array($v->status, ['closed', 'carried', 'paused'], true) || $v->closes_at->isPast()) {
            return 'closed';
        }

        return $this->sold($c) >= $c->max_tickets ? 'sold_out' : 'live';
    }

    public function sold(Competition $c): int
    {
        return (int) ($this->verity($c)?->tickets_sold ?? 0);
    }

    public function left(Competition $c): int
    {
        return max(0, $c->max_tickets - $this->sold($c));
    }

    public function soldPercent(Competition $c): int
    {
        return $c->max_tickets > 0 ? (int) floor($this->sold($c) * 100 / $c->max_tickets) : 0;
    }

    /** Tickets this owner holds (withdrawn entries don't count). */
    public function held(Competition $c, ?string $ownerRef): int
    {
        $v = $this->verity($c);
        if (! $v || ! $ownerRef) {
            return 0;
        }

        return (int) EntryGroup::query()->where('competition_id', $v->id)->where('owner_ref', $ownerRef)
            ->whereNull('withdrawn_at')->sum('quantity');
    }

    /** How many more this owner may buy now: 0 when it isn't on sale. */
    public function canBuy(Competition $c, ?string $ownerRef): int
    {
        if ($this->status($c) !== 'live') {
            return 0;
        }

        return max(0, min($c->max_per_person - $this->held($c, $ownerRef), $this->left($c)));
    }
}
