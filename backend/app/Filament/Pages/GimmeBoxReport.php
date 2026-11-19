<?php

namespace App\Filament\Pages;

use App\Filament\Support\Money;
use App\Models\Competition;
use App\Models\GimmeBox;
use App\Models\OrderLine;
use App\Services\CompetitionState;
use App\Services\Settings;
use BackedEnum;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;

/**
 * How the Gimme Box is doing: boxes shaken, added and paid for, their average value, the bonus tickets
 * given away, and per draw what share of its tickets came through boxes (flagged above the setting).
 */
class GimmeBoxReport extends Page
{
    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedGift;

    protected static ?string $title = 'Gimme Box Report';

    protected static ?int $navigationSort = 5;

    protected static string|\UnitEnum|null $navigationGroup = 'Competitions';

    protected string $view = 'filament.pages.gimme-box-report';

    /** @return array{on: bool, built: int, added: int, paid: int, addRate: string, payRate: string, avgValue: string, bonus: int, byMode: array<string, int>} */
    public function totals(): array
    {
        $all = GimmeBox::query()->selectRaw('status, mode, count(*) as n, sum(total_pence) as pence')->groupBy('status', 'mode')->get();
        $built = (int) $all->sum('n');
        $added = (int) $all->whereIn('status', ['added', 'ordered', 'paid'])->sum('n');
        $paidRows = $all->where('status', 'paid');
        $paid = (int) $paidRows->sum('n');
        $pct = fn (int $a, int $b) => $b > 0 ? round($a * 100 / $b).'%' : '—';
        $bonus = (int) OrderLine::query()->whereHas('order', fn ($q) => $q->where('status', 'paid'))->where('source', 'gimme_box')->sum('bonus_quantity');

        return [
            'on' => Settings::gimmeBoxOn(), 'built' => $built, 'added' => $added, 'paid' => $paid,
            'addRate' => $pct($added, $built), 'payRate' => $pct($paid, $added),
            'avgValue' => $paid ? Money::show((int) round($paidRows->sum('pence') / $paid)) : '—',
            'bonus' => $bonus,
            'byMode' => $all->groupBy('mode')->map(fn ($g) => (int) $g->sum('n'))->all(),
        ];
    }

    /** @return list<array{title: string, boxTickets: int, bonus: int, share: string, warn: bool}> */
    public function draws(): array
    {
        $limit = Settings::bounded('gimme_box_share_of_sales_pct', 1, 100);
        $state = app(CompetitionState::class);
        $lines = OrderLine::query()->whereHas('order', fn ($q) => $q->where('status', 'paid'))->where('source', 'gimme_box')
            ->selectRaw('competition_id, sum(quantity) as tickets, sum(bonus_quantity) as bonus')->groupBy('competition_id')->get()->keyBy('competition_id');
        $comps = Competition::query()->whereIn('id', $lines->keys())->get();

        return $comps->map(function (Competition $c) use ($lines, $state, $limit) {
            $l = $lines->get($c->id);
            $sold = max(1, $state->sold($c));
            $share = (int) round(((int) $l->tickets) * 100 / $sold);

            return ['title' => $c->title, 'boxTickets' => (int) $l->tickets, 'bonus' => (int) $l->bonus, 'sold' => $state->sold($c), 'share' => $share.'%', 'warn' => $share > $limit];
        })->sortByDesc('boxTickets')->values()->all();
    }
}
