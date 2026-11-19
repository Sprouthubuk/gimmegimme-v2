<?php

namespace App\Filament\Pages;

use App\Filament\Support\Money;
use App\Models\Competition;
use App\Models\OrderLine;
use BackedEnum;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;

/**
 * How bundles are selling: per competition, average order value, tickets per order, and how the paid
 * orders split between single tickets and each bundle. Paid orders only.
 */
class BundleReport extends Page
{
    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedChartBar;

    protected static ?string $title = 'Bundle Report';

    protected static ?int $navigationSort = 4;

    protected static string|\UnitEnum|null $navigationGroup = 'Competitions';

    protected string $view = 'filament.pages.bundle-report';

    /** @return list<array{title: string, orders: int, aov: string, tickets: string, split: list<array{label: string, orders: int, share: string}>}> */
    public function rows(): array
    {
        $lines = OrderLine::query()->join('orders', 'orders.id', '=', 'order_lines.order_id')->where('orders.status', 'paid')
            ->select('order_lines.competition_id', 'order_lines.order_id', 'order_lines.bundle_label', 'order_lines.quantity', 'order_lines.line_pence')
            ->get()->groupBy('competition_id');
        $comps = Competition::query()->with('bundleTiers')->whereIn('id', $lines->keys())->get()->keyBy('id');
        $titles = $comps->map->title;

        return $lines->map(function ($ls, $id) use ($titles, $comps) {
            $pick = $comps->get($id)?->bundleTiers->firstWhere('pivot.is_featured', true);
            $pickLabel = $pick?->displayLabel($pick->pivot->override_label);
            $orders = $ls->groupBy('order_id');
            $n = max(1, $orders->count());
            $split = $ls->groupBy(fn ($l) => $l->bundle_label ?: 'Single tickets')
                ->map(fn ($g, $label) => ['label' => $label, 'orders' => $g->pluck('order_id')->unique()->count()])
                ->sortByDesc('orders')->values()
                ->map(fn ($r) => $r + ['share' => round($r['orders'] * 100 / $n).'%'])
                ->map(fn ($r) => $pickLabel !== null && $r['label'] === $pickLabel ? ['label' => $r['label'].' (Our Pick)'] + $r : $r)->all();

            return [
                'title' => $titles[$id] ?? $id,
                'orders' => $orders->count(),
                'aov' => Money::show((int) round($ls->sum('line_pence') / $n)),
                'tickets' => number_format($ls->sum('quantity') / $n, 1),
                'split' => $split,
            ];
        })->sortByDesc('orders')->values()->all();
    }
}
