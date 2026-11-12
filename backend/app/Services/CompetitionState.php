<?php

namespace App\Services;

use App\Models\Competition;
use App\Models\Order;
use App\Models\OrderLine;
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

    /**
     * Tickets held back by card payments still in progress (the last hour, which is as long as the
     * sweep leaves a payment open). $userId: only that player's. They aren't Verity's yet, so without
     * this two players could both pay for the last tickets and one order would need a manual refund.
     */
    public function reserved(Competition $c, ?int $userId = null): int
    {
        return (int) OrderLine::query()->where('competition_id', $c->id)->whereNull('tickets')
            ->whereHas('order', fn ($q) => $q->whereIn('status', Order::UNPAID)->where('created_at', '>=', now()->subHour())
                ->when($userId, fn ($q) => $q->where('user_id', $userId)))
            ->sum('quantity');
    }

    /** How many more this owner may buy now: 0 when it isn't on sale. */
    public function canBuy(Competition $c, ?string $ownerRef): int
    {
        if ($this->status($c) !== 'live') {
            return 0;
        }
        $userId = $ownerRef ? Fulfilment::userIdFromOwner($ownerRef) : null;
        $mine = $this->held($c, $ownerRef) + ($userId ? $this->reserved($c, $userId) : 0);

        return max(0, min($c->max_per_person - $mine, $this->left($c) - $this->reserved($c)));
    }
}
