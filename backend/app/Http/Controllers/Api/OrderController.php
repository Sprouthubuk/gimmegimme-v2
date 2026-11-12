<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Presenters\AccountPresenter;
use App\Models\Order;
use App\Models\User;
use App\Payments\CashflowsGateway;
use App\Payments\GatewayAnswer;
use App\Payments\PaymentGateway;
use App\Services\Orders;
use App\Services\Pricing;
use App\Services\Reveal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class OrderController extends Controller
{
    private function present(): AccountPresenter
    {
        return app(AccountPresenter::class);
    }

    public function price(Request $r, Pricing $pricing): JsonResponse
    {
        $d = $this->validateLines($r);
        $p = $pricing->price($d['lines'], $r->user(), $d['promoCode'] ?? null);
        unset($p['competitions'], $p['subtotalPence']);

        return response()->json($p);
    }

    public function checkout(Request $r, Orders $orders): JsonResponse
    {
        $d = $this->validateLines($r) + $r->validate([
            'payWith' => ['required', 'in:wallet,card'],
            'useWallet' => ['sometimes', 'boolean'],
            'requestId' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9-]+$/'],
        ]);
        $res = $orders->checkout($r->user(), $d['lines'], $d['payWith'], (bool) ($d['useWallet'] ?? false), $d['promoCode'] ?? null, $d['requestId']);

        return response()->json([
            'order' => ['number' => $res['order']->number, 'status' => $res['order']->status],
            'next' => $res['next'],
            'redirectUrl' => $res['redirectUrl'],
        ], 201);
    }

    public function show(Request $r, string $number): JsonResponse
    {
        return response()->json($this->present()->order($this->own($r->user(), $number)));
    }

    /** The return pages and the order page: ask the gateway, then report. */
    public function return(Request $r, string $number, Orders $orders): JsonResponse
    {
        $d = $r->validate(['leftAs' => ['sometimes', 'nullable', 'in:failed,cancelled']]);
        $o = $orders->syncWithGateway($this->own($r->user(), $number), $d['leftAs'] ?? null);

        return response()->json($this->present()->order($o));
    }

    public function play(Request $r, string $number, Reveal $reveal): JsonResponse
    {
        $o = $this->own($r->user(), $number);
        abort_unless($o->status === 'paid', 409, "This order isn't paid yet.");

        return response()->json($reveal->forOrder($o, $r->user()));
    }

    /**
     * Cashflows' notification. Never trusted: the order is found only by the job reference stored at
     * checkout, and confirmed only after asking Cashflows about that job.
     */
    public function webhook(Request $r, Orders $orders, PaymentGateway $gateway): JsonResponse
    {
        // Nothing here is trusted either way, but a signature that is sent must be right.
        if ($r->hasHeader('Hash') && $gateway instanceof CashflowsGateway && ! $gateway->signatureValid($r->getContent(), (string) $r->header('Hash'))) {
            Log::warning('Cashflows notification with a wrong signature');

            return response()->json(['message' => 'Invalid signature'], 401);
        }
        $ref = $r->input('paymentJobReference');
        if (! GatewayAnswer::isReference($ref)) {
            return response()->json(['message' => 'Invalid notification'], 400);
        }
        $o = Order::query()->where('gateway_ref', $ref)->first();
        if (! $o) {
            Log::warning('Cashflows notification for an unknown payment job');

            return response()->json(['ok' => true]);
        }
        $orders->syncWithGateway($o);

        return response()->json(['ok' => true]);
    }

    private function own(User $u, string $number): Order
    {
        return Order::query()->where('number', $number)->where('user_id', $u->id)->firstOrFail();
    }

    private function validateLines(Request $r): array
    {
        return $r->validate([
            'lines' => ['required', 'array', 'min:1', 'max:'.Pricing::MAX_LINES],
            'lines.*.competitionId' => ['required', 'string', 'max:64'],
            'lines.*.quantity' => ['required', 'integer', 'min:1', 'max:100000'],
            'promoCode' => ['sometimes', 'nullable', 'string', 'max:32'],
        ]);
    }
}
