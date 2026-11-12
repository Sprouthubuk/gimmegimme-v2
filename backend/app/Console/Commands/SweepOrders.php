<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Services\Orders;
use Illuminate\Console\Command;

/**
 * Every 5 minutes: ask the gateway about card payments still waiting, close the ones that are
 * plainly abandoned (giving back their wallet part), and look again at recently closed ones in
 * case the player paid late.
 */
class SweepOrders extends Command
{
    protected $signature = 'orders:sweep';

    protected $description = 'Confirm, expire and re-check card payments';

    public function handle(Orders $orders): int
    {
        $confirmed = $expired = 0;
        Order::query()->whereIn('status', Order::UNPAID)->where('created_at', '<=', now()->subMinutes(10))->orderBy('created_at')->limit(500)->get()
            ->each(function (Order $o) use ($orders, &$confirmed, &$expired) {
                $o = $orders->syncWithGateway($o);
                if ($o->status === 'paid') {
                    $confirmed++;
                } elseif (in_array($o->status, Order::UNPAID, true) && $o->created_at->lte(now()->subHour())) {
                    // A hosted payment page doesn't stay open for an hour: close it. A late payment is still confirmed below.
                    $expired += $orders->closeUnpaid($o, 'expired') ? 1 : 0;
                }
            });
        $late = 0;
        Order::query()->whereIn('status', Order::CLOSED)->whereNotNull('gateway_ref')->where('closed_at', '>=', now()->subDay())->limit(500)->get()
            ->each(function (Order $o) use ($orders, &$late) {
                $late += $orders->syncWithGateway($o)->status === 'paid' ? 1 : 0;
            });
        $this->info("confirmed {$confirmed}, expired {$expired}, paid late {$late}");

        return self::SUCCESS;
    }
}
