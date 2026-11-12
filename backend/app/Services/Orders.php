<?php

namespace App\Services;

use App\Exceptions\RefusedException;
use App\Models\Order;
use App\Models\PromoCode;
use App\Models\User;
use App\Notifications\OrderReceipt;
use App\Payments\PaymentGateway;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * An order's whole life: checkout, deposits, confirmation after asking the gateway, closing
 * unpaid orders. Card payments are only ever confirmed by asking the gateway about the job
 * reference stored on the order at checkout.
 */
final class Orders
{
    public function __construct(
        private Pricing $pricing,
        private Wallet $wallet,
        private PlayCheck $check,
        private Fulfilment $fulfilment,
        private PaymentGateway $gateway,
        private Bonus $bonus,
    ) {}

    /**
     * @param  array<int, array{competitionId:string, quantity:int}>  $lines
     * @return array{order: Order, next: string, redirectUrl: ?string}
     */
    public function checkout(User $user, array $lines, string $payWith, bool $useWallet, ?string $promoCode, string $requestId): array
    {
        if ($existing = Order::query()->where('user_id', $user->id)->where('request_id', $requestId)->first()) {
            return $this->result($existing);
        }

        // Who may play is checked first, so a blocked player is told why (403), not that the basket has a problem.
        $this->check->assertAllowed($user);

        $order = DB::transaction(function () use ($user, $lines, $payWith, $useWallet, $promoCode, $requestId) {
            $this->wallet->lock($user->id);
            $user->refresh();
            $priced = $this->pricing->price($lines, $user, $promoCode);
            $lineProblem = collect($priced['lines'])->firstWhere('problem', '!=', null);
            if ($priced['problems'] || $lineProblem) {
                $message = $priced['problems'][0] ?? $lineProblem['title'].': '.$lineProblem['problem'];
                throw new RefusedException($message, 'basket_problem');
            }
            $total = $priced['totalPence'];
            if ($total < 1) {
                throw new RefusedException('Nothing to pay for.', 'basket_problem');
            }
            if ($payWith === 'wallet') {
                if (! $priced['walletCovers']) {
                    throw new RefusedException("Your wallet doesn't cover this order.", 'not_enough_wallet');
                }
                $walletPart = $total;
            } else {
                $walletPart = $useWallet ? min($priced['walletCanPayPence'], $total) : 0;
            }
            $cardPart = $total - $walletPart;
            if ($cardPart > 0 && $cardPart < Settings::minCard()) {
                throw new RefusedException('Card payments start at £'.number_format(Settings::minCard() / 100, 2).'.', 'card_minimum');
            }
            $this->check->assertAllowed($user, $cardPart);

            $order = Order::query()->create([
                'number' => Order::newNumber('GG'), 'user_id' => $user->id, 'order_type' => 'tickets', 'status' => 'created',
                'total_pence' => $total, 'card_pence' => $cardPart, 'promo_code' => $priced['promo']['code'] ?? null,
                'discount_pence' => $priced['promo']['discountPence'] ?? 0, 'request_id' => $requestId,
            ]);
            foreach ($priced['lines'] as $l) {
                $order->lines()->create(['competition_id' => $l['competitionId'], 'quantity' => $l['quantity'], 'unit_pence' => $l['unitPence'], 'line_pence' => $l['linePence']]);
            }
            $this->wallet->spendForOrder($order, $walletPart, $total);
            if ($cardPart === 0) {
                $this->markPaid($order, null);
            }

            return $order;
        });

        if ($order->status === 'created') {
            $this->openPaymentPage($order, $user);
        }

        return $this->result($order->refresh());
    }

    /** A wallet top up by card. */
    public function deposit(User $user, int $amountPence): Order
    {
        if ($amountPence < Settings::minDeposit()) {
            throw new RefusedException('The minimum top up is £'.number_format(Settings::minDeposit() / 100, 2).'.', 'deposit_minimum', 422, ['amountPence' => ['Below the minimum top up.']]);
        }
        if ($amountPence > Settings::maxTopUp()) {
            throw new RefusedException('The most you can top up at once is £'.number_format(Settings::maxTopUp() / 100, 2).'.', 'deposit_maximum', 422, ['amountPence' => ['Above the maximum top up.']]);
        }
        $order = DB::transaction(function () use ($user, $amountPence) {
            $this->wallet->lock($user->id);
            $this->check->assertAllowed($user->refresh(), $amountPence);

            return Order::query()->create([
                'number' => Order::newNumber('GD'), 'user_id' => $user->id, 'order_type' => 'deposit', 'status' => 'created',
                'total_pence' => $amountPence, 'card_pence' => $amountPence,
            ]);
        });
        $this->openPaymentPage($order, $user);

        return $order->refresh();
    }

    /**
     * Ask the gateway about the order's stored job and act on the answer. $leftAs is how the
     * player came back ("failed" / "cancelled"); it closes the order only once the gateway has
     * said it is not paid.
     */
    public function syncWithGateway(Order $order, ?string $leftAs = null): Order
    {
        if ($order->status === 'paid' || $order->status === 'refunded' || ! $order->gateway_ref) {
            return $order;
        }
        $answer = $this->gateway->lookup($order->gateway_ref);
        if ($answer === null) {
            return $order; // the gateway didn't answer: change nothing, the page keeps asking
        }
        if ($answer->status === 'paid') {
            if ($why = $answer->matches($order->gateway_ref, $order->number, $order->card_pence)) {
                Log::error('Gateway answer does not match the order; not confirmed', ['order' => $order->number, 'why' => $why]);

                return $order;
            }
            DB::transaction(fn () => $this->markPaid(Order::query()->lockForUpdate()->findOrFail($order->id), $answer->cardType));

            return $order->refresh();
        }
        $close = match ($answer->status) {
            'failed', 'cancelled', 'expired' => $answer->status,
            default => in_array($leftAs, ['failed', 'cancelled'], true) ? $leftAs : null,
        };
        if ($close) {
            $this->closeUnpaid($order, $close);
        }

        return $order->refresh();
    }

    /** Close an unpaid order and give back its wallet part. Leaves paid and refunded orders alone. */
    public function closeUnpaid(Order $order, string $status): bool
    {
        if (! in_array($status, Order::CLOSED, true)) {
            throw new \InvalidArgumentException("{$status} is not a closed status.");
        }

        return DB::transaction(function () use ($order, $status) {
            $o = Order::query()->lockForUpdate()->findOrFail($order->id);
            if (! in_array($o->status, Order::UNPAID, true)) {
                return false;
            }
            $o->forceFill(['status' => $status, 'closed_at' => now()])->save();
            $this->wallet->releaseOrder($o);

            return true;
        });
    }

    /** Mark paid and fulfil. Inside a transaction, with the order locked. A late payment on a closed order still counts. */
    private function markPaid(Order $order, ?string $cardType): void
    {
        if ($order->status === 'paid') {
            return;
        }
        $wasClosed = in_array($order->status, Order::CLOSED, true);
        if ($wasClosed && $order->wallet_pence > 0) {
            // The wallet part was given back when it closed: take it again, or flag it.
            try {
                $this->wallet->lock($order->user_id);
                $this->wallet->spendForOrder($order, $order->wallet_pence, $order->total_pence, 'late-spend');
            } catch (RefusedException) {
                $this->fulfilment->flag($order, 'Card paid after the order had closed, and the wallet no longer covers its wallet part.');
            }
        }
        $order->forceFill(['status' => 'paid', 'paid_at' => now(), 'card_type' => $cardType])->save();
        if ($order->promo_code) {
            PromoCode::query()->where('code', $order->promo_code)->increment('uses');
        }
        if ($order->isDeposit()) {
            $this->wallet->credit($order->user_id, 'deposit', $order->total_pence, 'Top up · Card', 'order:'.$order->id.':deposit', $order->id);
            $this->bonus->maybeGrant($order);
        } else {
            $this->fulfilment->fulfil($order);
        }
        if ($cardType === 'credit' && Settings::creditCardMonthlyCap() > 0) {
            $user = $order->user;
            $spent = $this->check->creditCardSpendThisMonth($user);
            if ($spent > Settings::creditCardMonthlyCap()) {
                $this->fulfilment->flag($order, 'Paid by credit card past the £250 monthly limit: refund the card part.');
            }
        }
        if ($wasClosed) {
            $this->fulfilment->flag($order, 'Paid after the order had closed.');
        }
        // The receipt goes once the payment is saved; a mail problem never undoes a payment.
        DB::afterCommit(function () use ($order) {
            try {
                $order->user->notify(new OrderReceipt($order->fresh()));
            } catch (\Throwable $e) {
                Log::warning('Order receipt not sent', ['order' => $order->number]);
            }
        });
    }

    private function openPaymentPage(Order $order, User $user): void
    {
        $site = rtrim((string) config('app.frontend_url'), '/');
        $success = $order->isDeposit() ? "{$site}/account/wallet?deposit={$order->number}" : "{$site}/order/{$order->number}";
        try {
            $job = $this->gateway->createPaymentJob($order, $user->email, [
                'success' => $success,
                'failed' => "{$site}/payment/failed?order={$order->number}",
                'cancelled' => "{$site}/payment/cancelled?order={$order->number}",
            ]);
        } catch (\Throwable $e) {
            Log::warning('Payment page not opened', ['order' => $order->number]);
            $order->forceFill(['status' => 'pending_payment'])->save();
            $this->closeUnpaid($order, 'failed');
            throw new RefusedException("We couldn't open the payment page. Nothing has been taken — please try again.", 'gateway_unavailable', 503);
        }
        $order->forceFill(['status' => 'pending_payment', 'gateway_ref' => $job['reference'], 'gateway_url' => $job['redirectUrl']])->save();
    }

    /** @return array{order: Order, next: string, redirectUrl: ?string} */
    private function result(Order $order): array
    {
        $next = match (true) {
            $order->status === 'paid' && $order->needs_attention => 'attention',
            $order->status === 'paid' => 'play',
            $order->status === 'pending_payment' && $order->gateway_url !== null => 'redirect',
            default => 'attention',
        };
        if (in_array($order->status, Order::CLOSED, true)) {
            throw new RefusedException('This order was closed. Please start again.', 'order_closed', 409);
        }

        return ['order' => $order, 'next' => $next, 'redirectUrl' => $next === 'redirect' ? $order->gateway_url : null];
    }
}
