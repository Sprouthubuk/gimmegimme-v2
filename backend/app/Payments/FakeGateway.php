<?php

namespace App\Payments;

use App\Models\Order;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\URL;

/**
 * Stands in for Cashflows in tests and on a developer's machine. Never used in production
 * (AppServiceProvider refuses it). The fake payment page is /api/fake-pay/{reference}.
 */
final class FakeGateway implements PaymentGateway
{
    public function createPaymentJob(Order $order, string $email, array $returnUrls): array
    {
        $ref = 'FAKE-'.strtoupper(bin2hex(random_bytes(6)));
        $this->put($ref, ['number' => $order->number, 'amount' => $order->card_pence, 'status' => 'pending', 'cardType' => 'debit', 'return' => $returnUrls]);

        return ['reference' => $ref, 'redirectUrl' => URL::to('/api/fake-pay/'.$ref)];
    }

    public function lookup(string $jobReference): ?GatewayAnswer
    {
        $j = Cache::get('fakepay:'.$jobReference);
        if (! $j) {
            return null;
        }

        return new GatewayAnswer($jobReference, $j['number'], $j['amount'], 'GBP', $j['status'], $j['status'] === 'paid' ? $j['cardType'] : null);
    }

    /** Test helper: what the player did on the payment page. */
    public function settle(string $jobReference, string $status, string $cardType = 'debit', ?int $amount = null): void
    {
        $j = Cache::get('fakepay:'.$jobReference) ?? throw new \RuntimeException('No such fake payment job');
        $j['status'] = $status;
        $j['cardType'] = $cardType;
        if ($amount !== null) {
            $j['amount'] = $amount;
        }
        $this->put($jobReference, $j);
    }

    public function job(string $jobReference): ?array
    {
        return Cache::get('fakepay:'.$jobReference);
    }

    private function put(string $ref, array $j): void
    {
        Cache::put('fakepay:'.$ref, $j, now()->addDay());
    }
}
