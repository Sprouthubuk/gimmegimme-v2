<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Payments\FakeGateway;
use App\Payments\PaymentGateway;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Response;

/** Local development only: what Cashflows' hosted page does, with three buttons. */
class FakePayController extends Controller
{
    public function page(string $ref, PaymentGateway $gw): Response
    {
        abort_unless($gw instanceof FakeGateway && ($job = $gw->job($ref)), 404);
        $e = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES);
        $amount = number_format($job['amount'] / 100, 2);

        return response(<<<HTML
            <!doctype html><meta name="viewport" content="width=device-width"><title>Test payment</title>
            <body style="font-family:sans-serif;padding:24px"><h1>Test payment · £{$amount}</h1><p>Order {$e($job['number'])}. No money moves.</p>
            <p><a id="pay" href="/api/fake-pay/{$e($ref)}/paid">Pay</a> · <a id="fail" href="/api/fake-pay/{$e($ref)}/failed">Decline</a> · <a id="cancel" href="/api/fake-pay/{$e($ref)}/cancelled">Cancel</a></p>
            HTML);
    }

    public function settle(string $ref, string $result, PaymentGateway $gw): RedirectResponse
    {
        abort_unless($gw instanceof FakeGateway && ($job = $gw->job($ref)), 404);
        // Leaving the page with "cancel" doesn't settle anything at the gateway, like the real one.
        if ($result !== 'cancelled') {
            $gw->settle($ref, $result);
        }

        return redirect()->away($job['return'][$result === 'paid' ? 'success' : $result]);
    }
}
