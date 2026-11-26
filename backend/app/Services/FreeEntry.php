<?php

namespace App\Services;

use App\Exceptions\RefusedException;
use App\Models\Competition;
use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Free-to-enter competitions (owner, 26 Nov 2026; docs/free-entry.md). A signed-in player claims their one ticket on the
 * competition page: the same play check as any purchase (sales switch, staff, 18+, email confirmed, self-exclusion,
 * break, hold), then a £0 order through Orders::issueFree, so the ticket and any instant win come from Verity as usual.
 */
final class FreeEntry
{
    public const TICKETS = 1;

    public function __construct(private Orders $orders, private PlayCheck $check, private CompetitionState $state) {}

    public function claim(User $user, Competition $c): Order
    {
        $this->check->assertAllowed($user, 0);

        return DB::transaction(function () use ($user, $c) {
            // One claim at a time per competition, so the last ticket and the one-each limit can't be raced.
            $c = Competition::query()->lockForUpdate()->findOrFail($c->id);
            if (! $c->is_free || ! $c->verity_ref) {
                throw new RefusedException('This competition isn’t free to enter.', 'not_free');
            }
            $status = $this->state->status($c);
            if ($status !== 'live') {
                throw new RefusedException($status === 'sold_out' ? 'All the free tickets have gone.' : 'This competition isn’t open for entries.', 'closed');
            }
            if ($this->state->canBuy($c, $user->ownerRef()) < self::TICKETS) {
                throw new RefusedException('You’ve already got your free ticket for this one.', 'already_entered');
            }

            return $this->orders->issueFree($user, $c, self::TICKETS, 'free_entry');
        });
    }
}
