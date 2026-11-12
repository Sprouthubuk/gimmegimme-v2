<?php

namespace App\Payments;

use App\Models\Order;

interface PaymentGateway
{
    /**
     * Create a hosted payment for the order's card part. Returns the job reference to store on the
     * order and the address to send the player to.
     *
     * @return array{reference:string, redirectUrl:string}
     */
    public function createPaymentJob(Order $order, string $email, array $returnUrls): array;

    /** Ask the gateway what happened to a payment job. Null when it didn't answer. */
    public function lookup(string $jobReference): ?GatewayAnswer;
}
