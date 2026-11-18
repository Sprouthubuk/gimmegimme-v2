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
        $sales = Daily::takings(7);
        $today = (int) end($sales);
        $week = array_sum($sales);
        $signUps = Daily::signUps(7);
        $players = User::query()->where('is_staff', false)->count();
        $open = Setting::bool('sales_open');
        $attention = Order::query()->where('needs_attention', true)->count();
        $withdrawals = Withdrawal::query()->where('status', 'requested')->count();
        $prizes = PrizeClaim::query()->where('status', 'open')->count();
        $messages = ContactMessage::query()->whereNull('handled_at')->count();
        $todo = $attention + $withdrawals + $prizes + $messages;

        return [
            Stat::make('Ticket Sales Today', Money::show($today))
                ->description(Money::show($week).' in the last 7 days')
                ->descriptionIcon(Heroicon::ArrowTrendingUp)
                ->chart(array_values($sales))->color('primary'),
            Stat::make('Players', number_format($players))
                ->description('+'.array_sum($signUps).' joined this week')
                ->descriptionIcon(Heroicon::UserPlus)
                ->chart(array_values($signUps))->color('info'),
            Stat::make('Sales', $open ? 'Open' : 'Closed')
                ->description($open ? 'Players can buy and play' : 'Turn on in Settings when ready')
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
