<?php

namespace App\Filament\Widgets;

use App\Filament\Support\Daily;
use Filament\Widgets\ChartWidget;
use Illuminate\Support\Carbon;

class SalesChart extends ChartWidget
{
    protected static ?int $sort = 3;

    protected ?string $heading = 'Card Money In, Last 30 Days';

    protected ?string $description = 'Card payments for tickets plus wallet top ups: the money Cashflows pays out. Tickets bought from wallet balances are not new money, so they are not counted.';

    protected int|string|array $columnSpan = 'full';

    protected ?string $maxHeight = '280px';

    protected function getData(): array
    {
        $days = Daily::cardIn(30);

        return [
            'datasets' => [
                [
                    'label' => 'Card money in (£)',
                    'data' => array_map(fn ($d) => round($d['pence'] / 100, 2), array_values($days)),
                    'borderColor' => '#ff2daa',
                    'backgroundColor' => 'rgba(255, 45, 170, 0.18)',
                    'fill' => true,
                    'tension' => 0.35,
                    'pointRadius' => 0,
                    'borderWidth' => 3,
                ],
                [
                    'label' => 'After Cashflows fees (£)',
                    'data' => array_map(fn ($d) => round(($d['pence'] - $d['fees']) / 100, 2), array_values($days)),
                    'borderColor' => '#22e6ff',
                    'backgroundColor' => 'rgba(34, 230, 255, 0.08)',
                    'fill' => true,
                    'tension' => 0.35,
                    'pointRadius' => 0,
                    'borderWidth' => 2,
                ],
            ],
            'labels' => array_map(fn ($d) => Carbon::parse($d)->format('j M'), array_keys($days)),
        ];
    }

    protected function getType(): string
    {
        return 'line';
    }

    protected function getOptions(): array
    {
        return [
            'plugins' => ['legend' => ['labels' => ['color' => '#d8d0e2', 'usePointStyle' => true]]],
            'scales' => [
                'x' => ['grid' => ['display' => false], 'ticks' => ['color' => '#8e84a0', 'maxTicksLimit' => 8]],
                'y' => ['grid' => ['color' => 'rgba(255,255,255,0.06)'], 'ticks' => ['color' => '#8e84a0'], 'beginAtZero' => true],
            ],
        ];
    }
}
