<?php

namespace App\Filament\Pages;

use App\Filament\Support\Money;
use App\Support\Csv;
use App\Support\Reports;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * What players hold now (winnings are what you owe: they can be withdrawn), and money in and out by day and by
 * week: card payments in, tickets bought from wallets, winnings credited from prizes, withdrawals paid.
 */
class MoneyReport extends Page
{
    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedBanknotes;

    protected static ?string $title = 'Money Report';

    protected static string|\UnitEnum|null $navigationGroup = 'Reports';

    protected static ?int $navigationSort = 2;

    protected static ?string $slug = 'money-report';

    protected string $view = 'filament.pages.money-report';

    public const DAYS = 14;

    public const WEEKS = 8;

    public function owed(): array
    {
        return Reports::owed();
    }

    public function daily(): array
    {
        return array_reverse(Reports::daily(self::DAYS), true);
    }

    public function weekly(): array
    {
        return array_reverse(Reports::weekly(self::WEEKS), true);
    }

    public function money(int $pence): string
    {
        return Money::show($pence);
    }

    protected function getHeaderActions(): array
    {
        return [
            Action::make('csv')->label('Download Daily CSV (90 Days)')->icon(Heroicon::OutlinedArrowDownTray)->action(fn () => $this->csv()),
        ];
    }

    public function csv(): StreamedResponse
    {
        $rows = [];
        foreach (Reports::daily(90) as $day => $r) {
            $rows[] = [$day, $r['orders'], ...array_map(fn ($p) => number_format($p / 100, 2, '.', ''), [$r['cardIn'], $r['walletSpend'], $r['winningsCredited'], $r['withdrawalsPaid'], $r['cardIn'] - $r['withdrawalsPaid']])];
        }

        return Csv::download('money-'.now('Europe/London')->format('Y-m-d').'.csv',
            ['Day (UK)', 'Ticket orders', 'Card in (£)', 'Tickets from wallets (£)', 'Winnings credited (£)', 'Withdrawals paid (£)', 'Card in less withdrawals (£)'], $rows);
    }

    public function dayLabel(string $d): string
    {
        return Carbon::parse($d, 'Europe/London')->format('D j M');
    }
}
