<?php

namespace App\Payments;

/** What the gateway said about one payment job, reduced to the facts we act on. */
final class GatewayAnswer
{
    public function __construct(
        public readonly ?string $jobReference,
        public readonly ?string $orderNumber,
        public readonly ?int $amountPence,
        public readonly ?string $currency,
        public readonly string $status,          // paid | failed | cancelled | expired | pending
        public readonly ?string $cardType = null, // credit | debit | null
    ) {}

    /**
     * The answer confirms this order only when it is about the same job, the same order number and
     * the same card amount to the penny. A missing field is a refusal, never a pass.
     */
    public function matches(string $storedReference, string $orderNumber, int $cardPence): ?string
    {
        return match (true) {
            $this->jobReference === null => 'the answer does not say which payment job it is about',
            ! hash_equals($storedReference, $this->jobReference) => 'the answer is about a different payment job',
            $this->orderNumber === null => 'the answer carries no order number',
            $this->orderNumber !== $orderNumber => 'the payment is for a different order',
            $this->amountPence === null => 'the answer carries no amount',
            $this->amountPence !== $cardPence => 'the amount paid is not the order amount',
            $this->currency !== null && strtoupper($this->currency) !== 'GBP' => 'the payment is not in pounds',
            default => null,
        };
    }

    public static function isReference(mixed $value): bool
    {
        return is_string($value) && preg_match('/^[A-Za-z0-9-]{1,64}$/', $value) === 1;
    }

    public static function mapStatus(?string $s): string
    {
        return match (strtolower((string) $s)) {
            'paid', 'captured' => 'paid',
            'failed', 'declined' => 'failed',
            'cancelled', 'canceled' => 'cancelled',
            'expired' => 'expired',
            default => 'pending',
        };
    }
}
