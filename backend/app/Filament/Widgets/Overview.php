<?php

namespace App\Filament\Widgets;

use App\Filament\Support\Daily;
use App\Filament\Support\Money;
use App\Models\ContactMessage;
use App\Models\Order;
use App\Models\PrizeClaim;
use App\Models\Setting;
use App\Models\User;
use App\Models\Withdrawal;
use Filament\Support\Icons\Heroicon;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;

class Overview extends StatsOverviewWidget
{
    protected static ?int $sort = 1;

    protected ?string $pollingInterval = '60s';

    protected function getColumns(): int
    {
        return 4;
    }

    protected function getStats(): array
    {
        // Real money in (card payments and top ups), not the value of tickets: tickets bought from wallet balances,
        // bonus or winnings brought no new money in.
        $money = Daily::cardIn(7);
        $today = end($money);
        $week = array_sum(array_column($money, 'pence'));
        $ticketsToday = (int) collect(Daily::takings(1))->last();
        $signUps = Daily::signUps(7);
        $players = User::query()->where('is_staff', false)->count();
        $open = Setting::bool('sales_open');
        $attention = Order::query()->where('needs_attention', true)->count();
        $withdrawals = Withdrawal::query()->where('status', 'requested')->count();
        $prizes = PrizeClaim::query()->where('status', 'open')->count();
        $messages = ContactMessage::query()->whereNull('handled_at')->count();
        $todo = $attention + $withdrawals + $prizes + $messages;

        return [
            Stat::make('Card Money In Today', Money::show($today['pence']))
                ->description('About '.Money::show($today['pence'] - $today['fees']).' after Cashflows fees · '.Money::show($week).' in 7 days')
                ->descriptionIcon(Heroicon::Banknotes)
                ->chart(array_column($money, 'pence'))->color('primary'),
            Stat::make('Players', number_format($players))
                ->description('+'.array_sum($signUps).' joined this week')
                ->descriptionIcon(Heroicon::UserPlus)
                ->chart(array_values($signUps))->color('info'),
            Stat::make('Sales', $open ? 'Open' : 'Closed')
                ->description($open ? Money::show($ticketsToday).' of tickets bought today, all ways of paying' : 'Turn on in Settings when ready')
                ->descriptionIcon($open ? Heroicon::CheckCircle : Heroicon::PauseCircle)
                ->color($open ? 'success' : 'danger'),
            Stat::make('To Do', (string) $todo)
                ->description(collect([
                    $attention ? "{$attention} order".($attention > 1 ? 's' : '').' to check' : null,
                    $withdrawals ? "{$withdrawals} to pay" : null,
                    $prizes ? "{$prizes} prize".($prizes > 1 ? 's' : '').' to send' : null,
                    $messages ? "{$messages} message".($messages > 1 ? 's' : '') : null,
                ])->filter()->implode(' · ') ?: 'All clear')
                ->descriptionIcon($todo ? Heroicon::BellAlert : Heroicon::Sparkles)
                ->color($todo ? 'warning' : 'success'),
        ];
    }
}
