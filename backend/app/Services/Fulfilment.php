<?php

namespace App\Services;

use App\Models\Competition;
use App\Models\Order;
use App\Models\PrizeClaim;
use App\Models\User;
use App\Notifications\PrizeWon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Sprouthub\Verity\Engine\VerityException;
use Sprouthub\Verity\Facades\Verity;
use Sprouthub\Verity\Models\Entry;
use Sprouthub\Verity\Models\EntryGroup;
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

    /**
     * Settle one entry group's instant wins and pay them. Safe to repeat.
     *
     * Verity fixed every outcome at publish and links each WINNING ticket to its prize when the
     * entry is made (instant_ticket_id); a losing ticket has no link and nothing to pay. So only the
     * winning entries are played through Verity (which records the winner and audits it): a few per
     * order, instead of every ticket one by one (playGroup), which took ~4 queries a ticket and
     * seconds for a 3,000-ticket order. Losing entries stay unplayed in Verity; the reveal shows them.
     */
    public function playAll(string $groupRef): void
    {
        $group = EntryGroup::query()->where('reference', $groupRef)->first();
        if (! $group) {
            return;
        }
        $winning = Entry::query()->where('entry_group_id', $group->id)->whereNotNull('instant_ticket_id');
        foreach ((clone $winning)->whereNull('revealed_at')->orderBy('id')->get() as $entry) {
            Verity::play($entry);
        }
        foreach (Winner::query()->whereIn('entry_id', (clone $winning)->select('id'))->where('type', 'instant')->get() as $w) {
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

    /**
     * A drawn (end) prize. One per person: a repeat win isn't paid and goes to a redraw (EndPrizeRules).
     * A site-credit end prize is paid to winnings once (reference verity-winner:{id}) and recorded as a
     * fulfilled claim; anything else is a claim handled by a person.
     */
    public function recordDrawWin(Winner $w): void
    {
        $rules = app(EndPrizeRules::class);
        $w->refresh(); // a just-created winner hasn't loaded its database defaults (status)
        if ($w->status !== 'active') {
            return;
        }
        if ($rules->isRepeatWinner($w)) {
            $rules->enforce($w->competition);

            return;
        }
        if (($userId = self::userIdFromOwner($w->owner_ref)) !== null) {
            $competition = Competition::query()->where('verity_ref', $w->competition->ref)->first();
            if ($competition?->end_prize_type === 'site_credit' && $w->prize_value_pence > 0 && User::query()->whereKey($userId)->exists()) {
                DB::transaction(function () use ($w, $userId) {
                    $this->wallet->credit($userId, 'winnings', (int) $w->prize_value_pence, 'End prize · '.$w->prize_name, 'verity-winner:'.$w->id);
                    $this->claim($w, $userId, 'draw', 'fulfilled');
                });
            } else {
                $this->claim($w, $userId, 'draw');
            }
        }
        // A redraw's replacement may free the next repeat win for its own redraw.
        $rules->enforce($w->competition);
    }

    public function flag(Order $order, string $reason): void
    {
        $order->forceFill(['needs_attention' => true, 'attention_reason' => mb_substr(trim(($order->attention_reason ? $order->attention_reason.' ' : '').$reason), 0, 300)])->save();
    }

    public static function userIdFromOwner(string $ownerRef): ?int
    {
        return preg_match('/^user:(\d+)$/', $ownerRef, $m) ? (int) $m[1] : null;
    }

    private function claim(Winner $w, int $userId, string $kind, string $status = 'open'): void
    {
        $competition = Competition::query()->where('verity_ref', $w->competition->ref)->first();
        if (! $competition || ! User::query()->whereKey($userId)->exists()) {
            return;
        }
        $claim = PrizeClaim::query()->firstOrCreate(['verity_winner_id' => $w->id], [
            'user_id' => $userId, 'competition_id' => $competition->id, 'prize_name' => $w->prize_name,
            'value_pence' => (int) $w->prize_value_pence, 'kind' => $kind, 'status' => $status,
        ]);
        if ($claim->wasRecentlyCreated) {
            DB::afterCommit(function () use ($claim) {
                try {
                    $claim->user->notify(new PrizeWon($claim));
                } catch (\Throwable $e) {
                    Log::warning('Prize email not sent', ['claim' => $claim->id]);
                }
            });
        }
    }
}
