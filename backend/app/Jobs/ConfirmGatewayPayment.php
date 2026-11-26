<?php

namespace App\Jobs;

use App\Models\Order;
use App\Services\Orders;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

/**
 * A Cashflows notification for an order, handled after the webhook has answered (Cashflows gives up on a slow
 * answer). It does exactly what the webhook did: `Orders::syncWithGateway`, which asks Cashflows about the job
 * reference stored on the order and confirms only on a matching answer. Nothing from the notification is used.
 *
 * Unique per order only until it starts, so a second notification arriving while one runs is still handled.
 * If Cashflows doesn't answer, nothing changes and `orders:sweep` (every 5 minutes) checks the order again.
 */
class ConfirmGatewayPayment implements ShouldBeUniqueUntilProcessing, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 3;

    public int $timeout = 120;

    public int $uniqueFor = 300;

    public function __construct(public string $orderId) {}

    public function uniqueId(): string
    {
        return $this->orderId;
    }

    public function backoff(): array
    {
        return [10, 30];
    }

    public function handle(Orders $orders): void
    {
        $order = Order::query()->find($this->orderId);
        if ($order) {
            $orders->syncWithGateway($order);
        }
    }
}
