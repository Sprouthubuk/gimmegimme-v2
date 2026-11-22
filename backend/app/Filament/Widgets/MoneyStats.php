<?php

namespace App\Filament\Widgets;

use App\Filament\Pages\MoneyReport;
use App\Filament\Pages\WinsReport;
use App\Filament\Support\Money;
use App\Support\Reports;
use Filament\Support\Icons\Heroicon;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;

/** What players hold and today's big wins, under the main dashboard numbers. */
class MoneyStats extends StatsOverviewWidget
{
    protected static ?int $sort = 2;

    protected ?string $pollingInterval = '60s';

    protected function getColumns(): int
    {
        return 3;
    }

    protected function getStats(): array
    {
        $o = Reports::owed();
        $today = now('Europe/London')->startOfDay()->utc();
        $big = Reports::bigWins($today, 100);
        $daily = Reports::daily(1);
        $won = (int) (end($daily)['winningsCredited'] ?? 0);

        return [
            Stat::make('Winnings Owed', Money::show($o['winnings']))
                ->description(number_format($o['playersWithWinnings']).' players · '.Money::show($o['withdrawalsWaiting']).' withdrawals waiting')
                ->descriptionIcon(Heroicon::Banknotes)->color('warning')->url(MoneyReport::getUrl()),
            Stat::make('Big Wins Today', (string) $big->count())
                ->description($big->count() ? Money::show((int) $big->sum('prize_value_pence')).' · biggest '.Money::show((int) $big->max('prize_value_pence')) : Money::show(Reports::bigWinPence()).' or more')
                ->descriptionIcon(Heroicon::Trophy)->color($big->count() ? 'danger' : 'gray')->url(WinsReport::getUrl()),
            Stat::make('Winnings Credited Today', Money::show($won))
                ->description('Cash and credit prizes paid to wallets')->descriptionIcon(Heroicon::Gift)->color('success'),
        ];
    }
}
