<?php

namespace App\Services;

use App\Models\AdminAction;
use App\Models\Competition;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Sprouthub\Verity\Facades\Verity;

/**
 * Publishing a competition hands its terms to Verity, which fixes them (price, tickets, closing time,
 * the instant-win table) and commits to the seed. After that the host record's terms are locked too.
 */
final class Publishing
{
    public const GAMES = ['scratch_card', 'spin_wheel', 'bingo_card', 'balloon_pop', 'hook_a_duck', 'claw_machine', 'coin_drop', 'slots', 'gems', 'classic'];

    public const SKINS = ['classic', 'christmas'];

    /** @return list<string> what stops this competition being published */
    public function problems(Competition $c): array
    {
        $p = [];
        if ($c->verity_ref) {
            $p[] = 'It is already published.';
        }
        if (! $c->closes_at || $c->closes_at->lte(now()->addMinutes(10))) {
            $p[] = 'The closing time must be at least 10 minutes away.';
        }
        if ($c->opens_at && $c->closes_at && $c->opens_at->gte($c->closes_at)) {
            $p[] = 'It must open before it closes.';
        }
        if ($c->price_pence < 1 || $c->max_tickets < 1 || $c->max_per_person < 1 || $c->max_per_person > $c->max_tickets) {
            $p[] = 'Price, tickets and tickets per person must be set, with tickets per person no more than the tickets.';
        }
        if (! $c->image) {
            $p[] = 'Add a picture.';
        }
        if ($c->isInstant()) {
            $prizes = $c->prizes()->get();
            if ($prizes->isEmpty()) {
                $p[] = 'An instant-win competition needs its prizes.';
            }
            if ($prizes->sum('quantity') > $c->max_tickets) {
                $p[] = 'There are more prizes than tickets.';
            }
            if ($prizes->contains(fn ($x) => $x->quantity < 1 || $x->value_pence < 0 || ! in_array($x->type, ['cash', 'site_credit', 'physical'], true))) {
                $p[] = 'Every prize needs a quantity and a type.';
            }
            if (! in_array($c->game, self::GAMES, true)) {
                $p[] = 'Choose a reveal game.';
            }
        } elseif (! $c->end_prize_name) {
            $p[] = 'A draw needs its prize.';
        }
        if (! in_array($c->skin ?? 'classic', self::SKINS, true)) {
            $p[] = 'Choose a game look.';
        }

        return $p;
    }

    public function publish(Competition $c, User $admin): Competition
    {
        if ($problems = $this->problems($c)) {
            throw new \DomainException(implode(' ', $problems));
        }

        return DB::transaction(function () use ($c, $admin) {
            $endPrizes = $c->end_prize_name ? [['name' => $c->end_prize_name, 'value_pence' => (int) $c->end_prize_value_pence]] : [];
            $instant = $c->isInstant()
                ? $c->prizes()->get()->map(fn ($p) => ['name' => $p->name, 'quantity' => (int) $p->quantity, 'value_pence' => (int) $p->value_pence, 'meta' => ['type' => $p->type]])->all()
                : [];
            $terms = [
                'title' => $c->title,
                'ticket_price_pence' => $c->price_pence,
                'max_tickets' => $c->max_tickets,
                'max_per_person' => $c->max_per_person,
                'closes_at' => $c->closes_at,
                'ticket_allocation' => 'random',
                'meta' => ['host_id' => $c->id, 'image' => $c->image],
            ];
            if ($c->opens_at && $c->opens_at->isFuture()) {
                $terms['publish_at'] = $c->opens_at;
            }
            $v = Verity::publish($terms, $endPrizes, $instant);
            $c->forceFill(['verity_ref' => $v->ref, 'published_at' => now()])->saveQuietly();
            AdminAction::record($admin, 'competition.published', $c->id, null, ['verity_ref' => $v->ref]);

            return $c->refresh();
        });
    }
}
