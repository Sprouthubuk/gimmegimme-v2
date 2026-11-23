<?php

namespace App\Http\Presenters;

use App\Models\Competition;
use App\Models\User;
use App\Services\Bundles;
use App\Services\CompetitionState;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
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

    /** @var array<string, object>|null instant prizes Verity added after launch, totals per Verity competition ref, read once per request */
    private ?array $boosts = null;

    public function __construct(private CompetitionState $state, private Bundles $bundles) {}

    /** Instant prizes Verity added to a competition after launch (prize boost, spec §17): count, value, top prize, when; or null. */
    public function boost(Competition $c): ?object
    {
        $this->boosts ??= DB::table('verity_instant_prizes as p')->join('verity_instant_additions as a', 'a.id', '=', 'p.addition_id')
            ->join('verity_competitions as vc', 'vc.id', '=', 'p.competition_id')->where('a.status', 'sealed')
            ->selectRaw('vc.ref, SUM(p.quantity) AS n, SUM(p.quantity * p.value_pence) AS v, MAX(p.value_pence) AS top, MIN(a.sealed_at) AS at')
            ->groupBy('vc.ref')->get()->keyBy('ref')->all();

        return $c->verity_ref ? ($this->boosts[$c->verity_ref] ?? null) : null;
    }

    public function summary(Competition $c): array
    {
        $boost = $c->isInstant() ? $this->boost($c) : null;
        $top = $c->isInstant() ? max((int) $c->prizes->max('value_pence'), (int) ($boost->top ?? 0)) : (int) $c->end_prize_value_pence;
        $prizeCount = $c->isInstant() ? (int) $c->prizes->sum('quantity') + (int) ($boost->n ?? 0) : null;
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
            'subtitle' => $c->subtitle ?? ($c->isInstant() ? number_format($prizeCount).' instant wins' : null),
            'soldPercent' => $this->state->soldPercent($c),
            // Shown to players since 22 Nov 2026 (owner): the maximum, how many sold and how many are left.
            'maxTickets' => (int) $c->max_tickets,
            'ticketsSold' => $this->state->sold($c),
            'ticketsLeft' => $this->state->left($c),
            // Max tickets one person may hold (owner, 22 Nov 2026); null when there's no limit.
            'maxPerPerson' => $c->max_per_person < $c->max_tickets ? (int) $c->max_per_person : null,
            'prizeCount' => $prizeCount,
            // Extra instant prizes Verity added after launch (prize boost, 23 Nov 2026): the card badge and the page banner.
            'boost' => $boost ? ['addedCount' => (int) $boost->n, 'addedPence' => (int) $boost->v, 'addedAt' => Carbon::parse($boost->at)->toIso8601ZuluString()] : null,
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
            // Verity's prizes: the ones fixed at launch and any it added later (spec §17, labelled with when).
            $added = $v ? DB::table('verity_instant_additions')->where('competition_id', $v->id)->where('status', 'sealed')->pluck('sealed_at', 'id') : collect();
            $keys = $v ? InstantPrize::query()->where('competition_id', $v->id)->orderBy('sort')->get(['key', 'name', 'value_pence', 'quantity', 'meta', 'addition_id']) : collect();
            $rows = $keys->isNotEmpty()
                ? $keys->filter(fn ($p) => $p->addition_id === null || isset($added[$p->addition_id]))
                    ->map(fn ($p) => ['name' => $p->name, 'valuePence' => (int) $p->value_pence, 'type' => $p->meta['type'] ?? 'site_credit', 'quantity' => (int) $p->quantity, 'won' => (int) ($won[$p->key] ?? 0),
                        'addedAt' => $p->addition_id ? Carbon::parse($added[$p->addition_id])->toIso8601ZuluString() : null])
                : $c->prizes->map(fn ($p) => ['name' => $p->name, 'valuePence' => (int) $p->value_pence, 'type' => $p->type, 'quantity' => (int) $p->quantity, 'won' => 0, 'addedAt' => null]);
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
            // How Verity added any later prizes (spec §17), from its own record: the public summary of each addition.
            'boostRecord' => $v ? DB::table('verity_instant_additions')->where('competition_id', $v->id)->where('status', 'sealed')->orderBy('number')->get()
                ->map(fn ($a) => ['addition' => (int) $a->number, 'reason' => $a->reason, 'addedAt' => Carbon::parse($a->sealed_at)->toIso8601ZuluString(),
                    'beaconSource' => $a->beacon_source, 'beaconRound' => $a->beacon_round !== null ? (int) $a->beacon_round : null, 'beaconRandomness' => $a->beacon_randomness,
                    'excludedCount' => (int) $a->excluded_count, 'excludedHash' => $a->excluded_hash, 'windowCount' => (int) $a->window_count, 'tableHash' => $a->table_hash,
                    'prizeCount' => (int) collect(json_decode((string) $a->prizes, true))->sum('quantity'),
                    'valuePence' => (int) collect(json_decode((string) $a->prizes, true))->sum(fn ($p) => (int) $p['quantity'] * (int) $p['value_pence'])])->values()->all() : [],
            'presets' => $c->presetList(),
            'popularPreset' => $c->popularPreset(),
            'minTickets' => (int) ($c->min_tickets ?: 1),
            // Bundles on sale now (live draws). Prices and tickets per bundle only, nothing about the pool.
            'bundles' => $this->bundles->forPlayers($c),
        ];
    }
}
