<?php

namespace App\Http\Presenters;

use App\Models\Competition;
use App\Models\User;
use App\Services\Bundles;
use App\Services\CompetitionState;
use Sprouthub\Verity\Models\InstantPrize;
use Sprouthub\Verity\Models\Winner;

/** CompetitionSummary / CompetitionDetail (frontend/src/lib/types.ts). Winning ticket numbers are listed, paged, by PublicController::winningNumbers. */
final class CompetitionPresenter
{
    public const GAME_LABELS = [
        'claw_machine' => 'Claw Machine', 'slots' => 'Slots', 'scratch_card' => 'Scratch Card', 'coin_drop' => 'Coin Drop',
        'balloon_pop' => 'Balloon Pop', 'gems' => 'Gems', 'hook_a_duck' => 'Hook a Duck', 'spin_wheel' => 'Spin the Wheel',
        'bingo_card' => 'Bingo Card', 'whack_a_mole' => 'Whack-a-Mole', 'pinata' => 'Piñata', 'classic' => 'Scratch Card',
    ];

    public function __construct(private CompetitionState $state, private Bundles $bundles) {}

    public function summary(Competition $c): array
    {
        $top = $c->isInstant() ? (int) $c->prizes->max('value_pence') : (int) $c->end_prize_value_pence;
        if ($c->isInstant() && $c->end_prize_value_pence) {
            $top = max($top, (int) $c->end_prize_value_pence);
        }
        $v = $this->state->verity($c);

        return [
            'id' => $c->id,
            'slug' => $c->slug,
            'title' => $c->title,
            'type' => $c->type,
            'status' => $this->state->status($c),
            'game' => $c->isInstant() ? $c->game : null,
            'gameLabel' => $c->isInstant() ? (self::GAME_LABELS[$c->game] ?? null) : null,
            'skin' => $c->skin ?? 'classic',
            ...$c->pictureFields(),
            'pricePence' => $c->price_pence,
            'topPrizePence' => $top ?: null,
            'subtitle' => $c->subtitle ?? ($c->isInstant() ? number_format((int) $c->prizes->sum('quantity')).' instant wins' : null),
            'soldPercent' => $this->state->soldPercent($c),
            'prizeCount' => $c->isInstant() ? (int) $c->prizes->sum('quantity') : null,
            'endPrize' => $c->isInstant() && $c->end_prize_name ? ['name' => $c->end_prize_name, 'valuePence' => (int) $c->end_prize_value_pence, 'count' => $c->endPrizeCount()] : null,
            'opensAt' => $c->opens_at?->toIso8601ZuluString(),
            'closesAt' => $c->closes_at?->toIso8601ZuluString(),
            'drawAt' => $c->hasDraw() ? ($v?->drawn_at ?? $c->closes_at)?->toIso8601ZuluString() : null,
            'featured' => (bool) $c->featured,
            'tags' => array_values($c->tags ?? []),
            // The featured ("Our Pick") bundle on sale now, for cards and the basket's suggestions.
            'featuredBundle' => $c->offersBundles() ? (collect($this->bundles->forPlayers($c))->firstWhere('ourPick', true)) : null,
        ];
    }

    public function detail(Competition $c, ?User $user): array
    {
        $v = $this->state->verity($c);
        $prizes = [];
        if ($c->isInstant()) {
            $won = $v ? Winner::query()->where('competition_id', $v->id)->where('type', 'instant')
                ->selectRaw('prize_key, COUNT(*) AS n')->groupBy('prize_key')->pluck('n', 'prize_key') : collect();
            $keys = $v ? InstantPrize::query()->where('competition_id', $v->id)->orderBy('sort')->get(['key', 'name', 'value_pence', 'quantity', 'meta']) : collect();
            $rows = $keys->isNotEmpty()
                ? $keys->map(fn ($p) => ['name' => $p->name, 'valuePence' => (int) $p->value_pence, 'type' => $p->meta['type'] ?? 'site_credit', 'quantity' => (int) $p->quantity, 'won' => (int) ($won[$p->key] ?? 0)])
                : $c->prizes->map(fn ($p) => ['name' => $p->name, 'valuePence' => (int) $p->value_pence, 'type' => $p->type, 'quantity' => (int) $p->quantity, 'won' => 0]);
            $prizes = $rows->sortByDesc('valuePence')->values()->all();
        }

        return $this->summary($c) + [
            'description' => (string) $c->description,
            'howToPlay' => $c->how_to_play,
            'heldByMe' => $user ? $this->state->held($c, $user->ownerRef()) : 0,
            'cashAlternativePence' => $c->cash_alternative_pence,
            'prizes' => $prizes,
            'endPrize' => $c->end_prize_name ? ['name' => $c->end_prize_name, 'valuePence' => (int) $c->end_prize_value_pence, 'count' => $c->endPrizeCount()] : null,
            'verityRef' => $v?->ref,
            'commitment' => $v?->commitment,
            'verifyUrl' => $v ? '/verify/'.$v->ref : null,
            'presets' => $c->presetList(),
            'popularPreset' => $c->popularPreset(),
            'minTickets' => (int) ($c->min_tickets ?: 1),
            // Bundles on sale now (live draws). Prices and tickets per bundle only, nothing about the pool.
            'bundles' => $this->bundles->forPlayers($c),
        ];
    }
}
