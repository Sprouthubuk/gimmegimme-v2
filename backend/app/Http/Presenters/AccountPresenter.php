<?php

namespace App\Http\Presenters;

use App\Models\Competition;
use App\Models\LedgerEntry;
use App\Models\Order;
use App\Models\OrderLine;
use App\Models\User;
use App\Services\CompetitionState;
use App\Services\PlayCheck;
use App\Services\Wallet;
use Sprouthub\Verity\Models\Winner;

/** Me, WalletTransaction, TicketGroup, OrderView, Limits. */
final class AccountPresenter
{
    public function __construct(private Wallet $wallet, private PlayCheck $check, private CompetitionState $state) {}

    public function me(User $u): array
    {
        $b = $this->wallet->balances($u);
        // Counted in the database: /api/me runs on every page a signed-in player opens.
        $active = OrderLine::query()->whereNotNull('tickets')
            ->whereHas('order', fn ($q) => $q->where('user_id', $u->id)->where('status', 'paid'))
            ->whereHas('competition', fn ($q) => $q->where('closes_at', '>', now())->whereNull('ended_at'))
            ->get(['competition_id', 'quantity']);

        return [
            'id' => (string) $u->id,
            'firstName' => $u->first_name,
            'lastName' => $u->last_name,
            'email' => $u->email,
            'emailVerified' => $u->hasVerifiedEmail(),
            'phone' => $u->phone,
            'dobVerified' => $u->date_of_birth !== null,
            'address' => ['line1' => $u->address_line1, 'line2' => $u->address_line2, 'city' => $u->city, 'postcode' => $u->postcode],
            'marketing' => ['email' => (bool) $u->marketing_email, 'sms' => (bool) $u->marketing_sms, 'winNotifications' => (bool) $u->win_notifications],
            'memberSince' => $u->created_at?->toIso8601ZuluString(),
            'wallet' => [
                'depositPence' => $b['deposit'], 'bonusPence' => $b['bonus'], 'winningsPence' => $b['winnings'],
                'totalPence' => array_sum($b), 'withdrawablePence' => $b['winnings'],
            ],
            'gamesWaiting' => $this->gamesWaiting($u),
            'stats' => [
                'activeTickets' => (int) $active->sum('quantity'),
                'activeCompetitions' => $active->pluck('competition_id')->unique()->count(),
                'instantWins' => Winner::query()->where('owner_ref', $u->ownerRef())->where('type', 'instant')->count(),
                'totalWonPence' => (int) LedgerEntry::query()->where('user_id', $u->id)->where('bucket', 'winnings')->where('direction', 'credit')->where('reference', 'like', 'verity-winner:%')->sum('amount_pence'),
                'spentThisWeekPence' => $this->check->paidInSince($u, now()->subDays(7)),
            ],
            'playBlock' => $this->check->block($u),
        ];
    }

    public function transactions(User $u, int $limit = 50): array
    {
        return LedgerEntry::query()->where('user_id', $u->id)->orderByDesc('id')->limit($limit)->get()
            ->map(fn (LedgerEntry $e) => [
                'id' => (string) $e->id, 'at' => $e->created_at->toIso8601ZuluString(), 'description' => $e->reason,
                'amountPence' => (int) $e->amount_pence, 'direction' => $e->direction === 'credit' ? 'in' : 'out', 'bucket' => $e->bucket,
            ])->all();
    }

    public function gamesWaiting(User $u): int
    {
        return (int) OrderLine::query()->whereNull('revealed_at')->whereNotNull('tickets')
            ->whereHas('order', fn ($q) => $q->where('user_id', $u->id)->where('status', 'paid'))
            ->whereHas('competition', fn ($q) => $q->where('type', 'instant'))->sum('quantity');
    }

    /** @return list<array<string, mixed>> TicketGroup[]: one per order line that was issued tickets. */
    public function ticketGroups(User $u, string $tab, int $limit): array
    {
        $lines = OrderLine::query()->whereNotNull('tickets')->with(['competition.prizes', 'order'])
            ->whereHas('order', fn ($q) => $q->where('user_id', $u->id)->where('status', 'paid'))
            ->orderByDesc('id')->limit(1000)->get();
        $out = [];
        foreach ($lines as $line) {
            $g = $this->group($line, $u);
            $keep = match ($tab) {
                'to-play' => $g['toPlay'] > 0,
                'won' => $g['wonPence'] > 0 || $g['status'] === 'won',
                'past' => in_array($g['competition']['status'], ['closed', 'drawn', 'ended'], true) && $g['toPlay'] === 0,
                default => in_array($g['competition']['status'], ['live', 'sold_out', 'scheduled'], true) || $g['toPlay'] > 0,
            };
            if ($keep) {
                $out[] = $g;
            }
            if (count($out) >= $limit) {
                break;
            }
        }

        return $out;
    }

    public function group(OrderLine $line, User $u): array
    {
        $c = $line->competition;
        $watched = $line->revealed_at !== null;
        $wins = $watched ? $this->winsByTicket($c, $line->tickets ?? []) : [];
        $tickets = array_map(fn ($n) => ['number' => $n, 'won' => isset($wins[$n]), 'played' => $c->isInstant() && $watched, 'prizeName' => $wins[$n]['name'] ?? null], $line->tickets ?? []);
        $toPlay = $c->isInstant() && ! $watched ? count($tickets) : 0;
        $wonPence = array_sum(array_column($wins, 'value'));
        $status = $this->state->status($c);
        $drawWin = $c->hasDraw() && in_array($status, ['drawn', 'ended'], true)
            && Winner::query()->where('owner_ref', $u->ownerRef())->where('type', 'main')->where('status', 'active')
                ->whereHas('competition', fn ($q) => $q->where('ref', $c->verity_ref))->exists();

        return [
            'competition' => [
                'id' => $c->id, 'slug' => $c->slug, 'title' => $c->title, 'type' => $c->type, 'image' => $c->imageUrl(),
                'drawAt' => $c->hasDraw() ? $c->closes_at->toIso8601ZuluString() : null, 'closesAt' => $c->closes_at->toIso8601ZuluString(), 'status' => $status,
            ],
            'orderNumber' => $line->order->number,
            'tickets' => $tickets,
            'toPlay' => $toPlay,
            'wonPence' => $wonPence,
            'status' => match (true) {
                $toPlay > 0 => 'to_play',
                $drawWin || $wonPence > 0 => 'won',
                $c->hasDraw() && in_array($status, ['drawn', 'ended'], true) => 'drawn',
                $c->hasDraw() => 'in_draw',
                default => 'no_win',
            },
        ];
    }

    /** Instant wins on these ticket numbers: [number => [name, value]]. */
    public function winsByTicket(Competition $c, array $numbers): array
    {
        $v = $this->state->verity($c);
        if (! $v || ! $c->isInstant() || ! $numbers) {
            return [];
        }
        $out = [];
        $rows = Winner::query()->where('verity_winners.competition_id', $v->id)->where('type', 'instant')
            ->join('verity_entries', 'verity_entries.id', '=', 'verity_winners.entry_id')
            ->whereIn('verity_entries.number', $numbers)->get(['verity_entries.number', 'verity_winners.prize_name', 'verity_winners.prize_value_pence', 'verity_winners.prize_key']);
        foreach ($rows as $r) {
            $out[(int) $r->number] = ['name' => $r->prize_name, 'value' => (int) $r->prize_value_pence, 'key' => $r->prize_key];
        }

        return $out;
    }

    public function order(Order $o): array
    {
        $lines = $o->lines()->with('competition')->get();

        return [
            'number' => $o->number,
            'status' => $o->status,
            'needsAttention' => (bool) $o->needs_attention,
            'totalPence' => $o->total_pence,
            'cardPence' => $o->card_pence,
            'walletPence' => $o->wallet_pence,
            'paidAt' => $o->paid_at?->toIso8601ZuluString(),
            'lines' => $lines->map(fn (OrderLine $l) => [
                'competitionId' => $l->competition_id, 'slug' => $l->competition->slug, 'title' => $l->competition->title,
                'image' => $l->competition->imageUrl(), 'type' => $l->competition->type, 'quantity' => $l->quantity,
                'tickets' => $l->tickets ?? [], 'drawAt' => $l->competition->hasDraw() ? $l->competition->closes_at->toIso8601ZuluString() : null,
            ])->all(),
            'toPlay' => $o->status === 'paid' ? (int) $lines->filter(fn ($l) => $l->competition->isInstant() && $l->tickets && ! $l->revealed_at)->sum('quantity') : 0,
        ];
    }

    public function limits(User $u): array
    {
        $l = $u->limits;
        $pending = $l && $l->pending_applies_at ? ['weeklyDepositPence' => $l->pending_remove ? null : $l->pending_weekly_deposit_pence, 'appliesAt' => $l->pending_applies_at->toIso8601ZuluString()] : null;

        return [
            'weeklyDepositPence' => $l?->weekly_deposit_pence,
            'pending' => $pending,
            'coolOffUntil' => $u->cool_off_until?->isFuture() ? $u->cool_off_until->toIso8601ZuluString() : null,
            'selfExcludedUntil' => $u->self_excluded_until?->isFuture() ? $u->self_excluded_until->toIso8601ZuluString() : null,
            'reminders' => ['sessionMinutes' => $l?->session_minutes, 'weeklySummary' => (bool) ($l?->weekly_summary)],
        ];
    }
}
