<?php

namespace App\Filament\Widgets;

use App\Models\ContactMessage;
use App\Models\Order;
use App\Models\PrizeClaim;
use App\Models\Setting;
use App\Models\Withdrawal;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;

class Overview extends StatsOverviewWidget
{
    protected function getStats(): array
    {
        $today = now('Europe/London')->startOfDay()->utc();
        $takings = (int) Order::query()->where('status', 'paid')->where('paid_at', '>=', $today)->where('order_type', 'tickets')->sum('total_pence');

        return [
            Stat::make('Sales', Setting::bool('sales_open') ? 'Open' : 'Closed')->color(Setting::bool('sales_open') ? 'success' : 'danger'),
            Stat::make('Ticket sales today', '£'.number_format($takings / 100, 2)),
            Stat::make('Orders needing attention', Order::query()->where('needs_attention', true)->count())->color('danger'),
            Stat::make('Withdrawals to pay', Withdrawal::query()->where('status', 'requested')->count()),
            Stat::make('Prizes to send', PrizeClaim::query()->where('status', 'open')->count()),
            Stat::make('Unread messages', ContactMessage::query()->whereNull('handled_at')->count()),
        ];
    }
}
