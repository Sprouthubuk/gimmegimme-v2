<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Payments\CashflowsGateway;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CashflowsHttpTest extends TestCase
{
    public function test_creates_a_job_with_the_signed_body_and_reads_the_job_back(): void
    {
        $gw = new CashflowsGateway('https://gateway-int.cashflows.com', 'CONF-1', 'api-secret');
        Http::fake([
            'gateway-int.cashflows.com/api/gateway/payment-jobs' => Http::response(['data' => ['reference' => 'JOB-77'], 'links' => ['action' => ['url' => 'https://gateway-int.cashflows.com/pay/JOB-77']]]),
            'gateway-int.cashflows.com/api/gateway/payment-jobs/JOB-77' => Http::response(['data' => ['reference' => 'JOB-77', 'status' => 'Paid', 'order' => ['orderNumber' => 'GG-X1234567'], 'amountToCollect' => '4.00']]),
        ]);
        $order = new Order(['number' => 'GG-X1234567', 'card_pence' => 400]);
        $job = $gw->createPaymentJob($order, 'p@example.com', ['success' => 'https://s/ok', 'failed' => 'https://s/f', 'cancelled' => 'https://s/c']);
        $this->assertSame(['reference' => 'JOB-77', 'redirectUrl' => 'https://gateway-int.cashflows.com/pay/JOB-77'], $job);

        Http::assertSent(function (Request $r) {
            if ($r->method() !== 'POST') {
                return false;
            }
            $body = $r->body();
            $data = json_decode($body, true);

            return $r->header('ConfigurationId')[0] === 'CONF-1'
                && $r->header('Hash')[0] === hash('sha512', 'api-secret'.$body)
                && $data['amountToCollect'] === '4.00' && $data['currency'] === 'GBP'
                && $data['order']['orderNumber'] === 'GG-X1234567'
                && $data['parameters']['returnUrlCancelled'] === 'https://s/c';
        });

        $answer = $gw->lookup('JOB-77');
        $this->assertNull($answer->matches('JOB-77', 'GG-X1234567', 400));
        Http::assertSent(fn (Request $r) => $r->method() === 'GET' && $r->header('Hash')[0] === hash('sha512', 'api-secret'));
    }

    public function test_a_bad_reference_never_reaches_the_gateway(): void
    {
        Http::fake();
        $gw = new CashflowsGateway('https://gateway-int.cashflows.com', 'CONF-1', 'k');
        $this->assertNull($gw->lookup('../../admin'));
        Http::assertNothingSent();
    }

    public function test_a_refused_job_creation_is_an_error_not_a_redirect(): void
    {
        Http::fake(['*' => Http::response(['errors' => ['bad']], 400)]);
        $gw = new CashflowsGateway('https://gateway-int.cashflows.com', 'CONF-1', 'k');
        $this->expectException(\RuntimeException::class);
        $gw->createPaymentJob(new Order(['number' => 'GG-1', 'card_pence' => 100]), 'a@b.c', ['success' => 'x', 'failed' => 'y', 'cancelled' => 'z']);
    }
}
