<?php

namespace Tests\Unit;

use App\Payments\CashflowsGateway;
use App\Payments\GatewayAnswer;
use PHPUnit\Framework\TestCase;

class CashflowsTest extends TestCase
{
    private function job(array $over = []): array
    {
        return ['data' => array_replace_recursive([
            'reference' => 'JOB-123', 'status' => 'Pending',
            'order' => ['orderNumber' => 'GG-ABCD1234'], 'amountToCollect' => '12.50', 'currency' => 'GBP',
            'payments' => [
                ['reference' => 'P-1', 'status' => 'Failed'],
                ['reference' => 'P-2', 'status' => 'Paid', 'paymentMethod' => ['card' => ['cardType' => 'CREDIT']]],
            ],
        ], $over)];
    }

    public function test_reads_the_paid_payment_amount_order_and_card_type(): void
    {
        $a = CashflowsGateway::parse($this->job());
        $this->assertSame(['JOB-123', 'GG-ABCD1234', 1250, 'paid', 'credit'], [$a->jobReference, $a->orderNumber, $a->amountPence, $a->status, $a->cardType]);
        $this->assertNull($a->matches('JOB-123', 'GG-ABCD1234', 1250));
    }

    public function test_refuses_anything_that_does_not_match_or_is_missing(): void
    {
        $a = CashflowsGateway::parse($this->job());
        $this->assertNotNull($a->matches('JOB-999', 'GG-ABCD1234', 1250));
        $this->assertNotNull($a->matches('JOB-123', 'GG-OTHER000', 1250));
        $this->assertNotNull($a->matches('JOB-123', 'GG-ABCD1234', 1251));
        $missing = CashflowsGateway::parse(['data' => ['reference' => 'JOB-123', 'status' => 'Paid']]);
        $this->assertSame('the answer carries no order number', $missing->matches('JOB-123', 'GG-ABCD1234', 1250));
        $usd = CashflowsGateway::parse($this->job(['currency' => 'USD']));
        $this->assertNotNull($usd->matches('JOB-123', 'GG-ABCD1234', 1250));
    }

    public function test_status_mapping_and_reference_shape(): void
    {
        $this->assertSame('pending', CashflowsGateway::parse(['data' => ['reference' => 'J', 'status' => 'Pending']])->status);
        foreach (['Captured' => 'paid', 'Declined' => 'failed', 'Cancelled' => 'cancelled', 'Expired' => 'expired', 'Weird' => 'pending'] as $in => $out) {
            $this->assertSame($out, GatewayAnswer::mapStatus($in));
        }
        foreach (['ABC-123', 'a1'] as $ok) {
            $this->assertTrue(GatewayAnswer::isReference($ok));
        }
        foreach (['../x', 'a b', 'a/b', '', str_repeat('a', 65), 'a%2F'] as $bad) {
            $this->assertFalse(GatewayAnswer::isReference($bad), $bad);
        }
    }
}
