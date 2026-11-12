<?php

namespace App\Services;

use App\Models\Competition;
use App\Models\Order;
use App\Models\PrizeClaim;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Sprouthub\Verity\Engine\VerityException;
use Sprouthub\Verity\Facades\Verity;
use Sprouthub\Verity\Models\Entry;
use Sprouthub\Verity\Models\InstantPrize;
use Sprouthub\Verity\Models\Winner;

/**
 * Issues a paid order's tickets through Verity and settles its instant wins, in the same
 * transaction that marks the order paid. Instant prizes are won when the ticket is sold: every
 * instant-win ticket is played here and cash or site-credit prizes go straight to the winnings
 * balance. The reveal the player watches later only shows what is already stored.
 *
 * A line Verity refuses (closed, sold out, over the limit) gets no tickets and the order is
 * flagged for a person. It is never refunded automatically.
 */
final class Fulfilment
{
    public function __construct(private Wallet $wallet) {}

    /** Call inside the transaction that marks the order paid, with the order row locked. */
    public function fulfil(Order $order): void
    {
        if ($order->fulfilled_at !== null || $order->isDeposit()) {
            return;
        }
        $owner = 'user:'.$order->user_id;
        $problems = [];
        foreach ($order->lines()->with('competition')->get() as $line) {
            $c = $line->competition;
            try {
                $group = Verity::addEntries($c->verity_ref, $owner, $line->quantity, [
                    'host_ref' => 'order:'.$order->id,
                    'total_pence' => $line->line_pence,
                    'ordered_at' => $order->created_at,
                ]);
            } catch (VerityException $e) {
                Log::warning('Verity refused entries for a paid order', ['order' => $order->number, 'competition' => $c->verity_ref, 'why' => $e->getMessage()]);
                $problems[] = $c->title.': '.$e->getMessage();

                continue;
            }
            $numbers = Entry::query()->where('entry_group_id', $group->id)->orderBy('number')->pluck('number')->map(fn ($n) => (int) $n)->all();
            $line->forceFill(['entry_group_ref' => $group->reference, 'owner_tag' => $group->owner_tag, 'tickets' => $numbers])->save();
            if ($c->isInstant()) {
                $this->playAll($group->reference);
            }
        }
        $order->forceFill(['fulfilled_at' => now()])->save();
        if ($problems) {
            $this->flag($order, 'Paid, but not every ticket could be issued. '.implode(' ', $problems));
        }
    }

    /** Play every instant-win entry in one entry group and pay what it won. Safe to repeat. */
    public function playAll(string $groupRef): void
    {
        do {
            $r = Verity::playGroup($groupRef);
        } while ($r['played'] > 0 && $r['remaining'] > 0);
        $entryIds = array_column(array_filter($r['entries'], fn ($e) => $e['won']), 'entry');
        foreach (Winner::query()->whereIn('entry_id', $entryIds)->where('type', 'instant')->get() as $w) {
            $this->awardInstantWin($w);
        }
    }

    /** Pay one instant win: cash and site credit to winnings, a physical prize to a claim. Once only. */
    public function awardInstantWin(Winner $w): void
    {
        $userId = self::userIdFromOwner($w->owner_ref);
        if ($userId === null) {
            return; // not one of our accounts (e.g. a postal entry waiting for an account)
        }
        $prize = InstantPrize::query()->where('competition_id', $w->competition_id)->where('key', $w->prize_key)->first();
        $type = $prize?->meta['type'] ?? 'site_credit';
        if ($type === 'physical') {
            $this->claim($w, $userId, 'instant');

            return;
        }
        if ($w->prize_value_pence > 0) {
            $this->wallet->credit($userId, 'winnings', (int) $w->prize_value_pence, 'Instant win · '.$w->prize_name, 'verity-winner:'.$w->id);
        }
    }

    /** A drawn (end) prize: always handled by a person. */
    public function recordDrawWin(Winner $w): void
    {
        if (($userId = self::userIdFromOwner($w->owner_ref)) !== null) {
            $this->claim($w, $userId, 'draw');
        }
    }

    public function flag(Order $order, string $reason): void
    {
        $order->forceFill(['needs_attention' => true, 'attention_reason' => mb_substr(trim(($order->attention_reason ? $order->attention_reason.' ' : '').$reason), 0, 300)])->save();
    }

    public static function userIdFromOwner(string $ownerRef): ?int
    {
        return preg_match('/^user:(\d+)$/', $ownerRef, $m) ? (int) $m[1] : null;
    }

    private function claim(Winner $w, int $userId, string $kind): void
    {
        $competition = Competition::query()->where('verity_ref', $w->competition->ref)->first();
        if (! $competition || ! User::query()->whereKey($userId)->exists()) {
            return;
        }
        PrizeClaim::query()->firstOrCreate(['verity_winner_id' => $w->id], [
            'user_id' => $userId, 'competition_id' => $competition->id, 'prize_name' => $w->prize_name,
            'value_pence' => (int) $w->prize_value_pence, 'kind' => $kind,
        ]);
    }
}
