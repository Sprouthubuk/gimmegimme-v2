<?php

namespace Tests\Feature;

use App\Jobs\ConfirmGatewayPayment;
use App\Models\Order;
use App\Models\User;
use App\Services\Orders;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Cashflows gives up on a notification that isn't answered quickly and emails "Failed to sent a 'changed status'
 * notification". The webhook therefore only checks the message and finds the order, answers at once, and leaves
 * asking Cashflows and confirming the payment to a queued job (the same syncWithGateway as the return page and sweep).
 */
class WebhookQueueTest extends TestCase
{
    private function checkout(User $u, $c, int $qty, array $extra = [])
    {
        return $this->actingAs($u)->postJson('/api/checkout', $extra + [
            'lines' => [['competitionId' => $c->id, 'quantity' => $qty]], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid(),
        ]);
    }

    public function test_the_webhook_answers_at_once_and_confirms_the_payment_in_the_background(): void
    {
        $u = $this->player();
        $number = $this->checkout($u, $this->competition('draw'), 4, ['payWith' => 'card'])->json('order.number');
        $order = Order::query()->where('number', $number)->first();
        auth()->forgetGuards();
        $this->gateway()->settle($order->gateway_ref, 'paid');

        Queue::fake();
        $this->postJson('/api/webhooks/cashflows', ['paymentJobReference' => $order->gateway_ref])->assertOk();
        $this->assertSame('pending_payment', $order->refresh()->status, 'the webhook itself must not do the slow work');
        Queue::assertPushed(ConfirmGatewayPayment::class, fn (ConfirmGatewayPayment $job) => $job->orderId === $order->id);

        // An unknown job, a bad reference and an already-paid order queue nothing.
        $this->postJson('/api/webhooks/cashflows', ['paymentJobReference' => 'UNKNOWN-1'])->assertOk();
        $this->postJson('/api/webhooks/cashflows', ['paymentJobReference' => '../x'])->assertStatus(400);
        Queue::assertPushed(ConfirmGatewayPayment::class, 1);

        // The job does what the webhook used to: ask Cashflows, then confirm.
        (new ConfirmGatewayPayment($order->id))->handle(app(Orders::class));
        $this->assertSame('paid', $order->refresh()->status);

        $this->postJson('/api/webhooks/cashflows', ['paymentJobReference' => $order->gateway_ref])->assertOk();
        Queue::assertPushed(ConfirmGatewayPayment::class, 1);

        // Running it again (a repeated notification) changes nothing and doesn't fail.
        (new ConfirmGatewayPayment($order->id))->handle(app(Orders::class));
        $this->assertSame('paid', $order->refresh()->status);
    }

    public function test_a_late_notification_is_not_swallowed_while_an_earlier_one_is_being_processed(): void
    {
        $job = new ConfirmGatewayPayment('123');
        $this->assertInstanceOf(ShouldBeUniqueUntilProcessing::class, $job);
        $this->assertSame('123', $job->uniqueId());
    }
}
