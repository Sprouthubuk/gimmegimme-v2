<?php

namespace Tests\Feature;

use App\Exceptions\RefusedException;
use App\Models\Order;
use App\Models\PrizeClaim;
use App\Models\Setting;
use App\Services\Fulfilment;
use App\Services\Orders;
use App\Services\PlayCheck;
use Illuminate\Support\Str;
use Sprouthub\Verity\Models\EntryGroup;
use Tests\TestCase;

class OrdersTest extends TestCase
{
    private function orders(): Orders
    {
        return app(Orders::class);
    }

    private function buy($user, $competition, int $qty, string $payWith = 'wallet', bool $useWallet = true, ?string $rid = null): array
    {
        return $this->orders()->checkout($user, [['competitionId' => $competition->id, 'quantity' => $qty]], $payWith, $useWallet, null, $rid ?? (string) Str::uuid());
    }

    public function test_a_wallet_order_is_paid_and_its_tickets_issued_by_verity_at_once(): void
    {
        $u = $this->player();
        $this->topUp($u, 1000);
        $c = $this->competition('draw');
        $r = $this->buy($u, $c, 10);

        $this->assertSame('play', $r['next']);
        $order = $r['order'];
        $this->assertSame('paid', $order->status);
        $this->assertSame(250, $order->wallet_pence);
        $this->assertSame(0, $order->card_pence);
        $line = $order->lines()->first();
        $this->assertCount(10, $line->tickets);
        $this->assertSame(10, EntryGroup::query()->where('host_ref', 'order:'.$order->id)->value('quantity'));
        $this->assertSame(750, $this->wallet()->total($u));
    }

    public function test_instant_prizes_are_won_and_credited_when_the_ticket_is_sold(): void
    {
        $u = $this->player();
        $this->topUp($u, 1000);
        // Every ticket wins: 100 tickets, 100 prizes of 50p.
        $c = $this->competition('instant', ['max_tickets' => 100, 'max_per_person' => 100], [['50p Credit', 50, 100, 'site_credit']]);
        $r = $this->buy($u, $c, 4);

        $this->assertSame('paid', $r['order']->status);
        $b = $this->wallet()->balances($u);
        $this->assertSame(200, $b['winnings']);
        $this->assertSame(900, $b['deposit']);
        // Repeating the play pays nothing twice.
        app(Fulfilment::class)->playAll($r['order']->lines()->value('entry_group_ref'));
        $this->assertSame(200, $this->wallet()->balances($u)['winnings']);
    }

    public function test_a_physical_instant_prize_becomes_a_claim_not_money(): void
    {
        $u = $this->player();
        $this->topUp($u, 1000);
        $c = $this->competition('instant', ['max_tickets' => 10, 'max_per_person' => 10], [['Air Fryer', 8000, 10, 'physical']]);
        $this->buy($u, $c, 2);
        $this->assertSame(0, $this->wallet()->balances($u)['winnings']);
        $this->assertSame(2, PrizeClaim::query()->where('user_id', $u->id)->where('kind', 'instant')->count());
    }

    public function test_a_card_order_waits_for_the_gateway_then_confirms_only_on_a_matching_answer(): void
    {
        $u = $this->player();
        $this->topUp($u, 100);
        $c = $this->competition('draw');
        $r = $this->buy($u, $c, 20, 'card', true); // £5: £1 wallet + £4 card

        $this->assertSame('redirect', $r['next']);
        $order = $r['order'];
        $this->assertSame('pending_payment', $order->status);
        $this->assertSame(400, $order->card_pence);
        $this->assertSame(100, $order->wallet_pence);
        $this->assertStringContainsString('/fake-pay/', $r['redirectUrl']);
        $this->assertSame(0, $this->wallet()->total($u), 'the wallet part is taken at checkout');

        // Still pending at the gateway: nothing changes, even if the player says they left.
        $this->assertSame('pending_payment', $this->orders()->syncWithGateway($order)->status);

        $this->gateway()->settle($order->gateway_ref, 'paid');
        $order = $this->orders()->syncWithGateway($order);
        $this->assertSame('paid', $order->status);
        $this->assertSame('debit', $order->card_type);
        $this->assertCount(20, $order->lines()->first()->tickets);
    }

    public function test_an_answer_for_a_different_amount_never_confirms(): void
    {
        $u = $this->player();
        $c = $this->competition('draw');
        $order = $this->buy($u, $c, 20, 'card', false)['order'];
        $this->gateway()->settle($order->gateway_ref, 'paid', 'debit', 100);
        $this->assertSame('pending_payment', $this->orders()->syncWithGateway($order)->status);
        $this->assertNull($order->refresh()->paid_at);
        $this->assertSame(0, EntryGroup::query()->count());
    }

    public function test_a_failed_card_payment_closes_the_order_and_gives_the_wallet_part_back(): void
    {
        $u = $this->player();
        $this->topUp($u, 100, 'winnings');
        $c = $this->competition('draw');
        $order = $this->buy($u, $c, 20, 'card', true)['order'];
        $this->gateway()->settle($order->gateway_ref, 'failed');
        $order = $this->orders()->syncWithGateway($order, 'failed');
        $this->assertSame('failed', $order->status);
        $this->assertSame(['deposit' => 0, 'bonus' => 0, 'winnings' => 100], $this->wallet()->balances($u));
    }

    public function test_coming_back_cancelled_closes_only_once_the_gateway_agrees_it_is_not_paid(): void
    {
        $u = $this->player();
        $c = $this->competition('draw');
        $order = $this->buy($u, $c, 20, 'card', false)['order'];
        // Gateway still says pending, player came back via "cancelled": closed as cancelled.
        $this->assertSame('cancelled', $this->orders()->syncWithGateway($order, 'cancelled')->status);
    }

    public function test_a_late_payment_on_a_closed_order_is_still_confirmed_and_flagged(): void
    {
        $u = $this->player();
        $this->topUp($u, 100);
        $c = $this->competition('draw');
        $order = $this->buy($u, $c, 20, 'card', true)['order'];
        $this->orders()->closeUnpaid($order, 'expired');
        $this->assertSame(100, $this->wallet()->total($u));

        $this->gateway()->settle($order->gateway_ref, 'paid');
        $order = $this->orders()->syncWithGateway($order->refresh());
        $this->assertSame('paid', $order->status);
        $this->assertTrue($order->needs_attention);
        $this->assertSame(0, $this->wallet()->total($u), 'the wallet part is taken again');
        $this->assertCount(20, $order->lines()->first()->tickets);
    }

    public function test_a_paid_order_verity_refuses_is_flagged_never_refunded(): void
    {
        $u = $this->player();
        $this->topUp($u, 2000);
        $c = $this->competition('draw', ['max_per_person' => 100]);
        $pending = $this->buy($u, $c, 60, 'card', false)['order'];   // not issued yet
        $this->buy($u, $c, 60);                                      // wallet: issued now, holds 60
        $this->gateway()->settle($pending->gateway_ref, 'paid');
        $order = $this->orders()->syncWithGateway($pending);

        $this->assertSame('paid', $order->status);
        $this->assertTrue($order->needs_attention);
        $this->assertNull($order->lines()->first()->tickets);
        $this->assertSame('attention', $this->buy($u, $c, 1, 'wallet', true, $pending->request_id)['next']);
    }

    public function test_the_same_request_id_returns_the_same_order(): void
    {
        $u = $this->player();
        $this->topUp($u, 1000);
        $c = $this->competition('draw');
        $a = $this->buy($u, $c, 4, rid: 'same-request');
        $b = $this->buy($u, $c, 4, rid: 'same-request');
        $this->assertSame($a['order']->id, $b['order']->id);
        $this->assertSame(900, $this->wallet()->total($u));
        $this->assertSame(1, Order::query()->count());
    }

    /** @return iterable<string, array{0: array<string, mixed>, 1: string}> */
    public static function refusals(): iterable
    {
        yield 'under 18' => [['date_of_birth' => now()->subYears(17)->toDateString()], 'under_18'];
        yield 'no date of birth' => [['date_of_birth' => null], 'no_date_of_birth'];
        yield 'unverified email' => [['email_verified_at' => null], 'email_unverified'];
        yield 'self-excluded' => [['self_excluded_until' => now()->addMonth()], 'self_excluded'];
        yield 'on a break' => [['cool_off_until' => now()->addDay()], 'cool_off'];
        yield 'staff' => [['is_staff' => true], 'staff'];
        yield 'admin' => [['is_admin' => true], 'staff'];
        yield 'on hold' => [['on_hold_at' => now()], 'on_hold'];
        yield 'closed account' => [['closed_at' => now()], 'closed'];
    }

    /** @dataProvider refusals */
    public function test_the_play_check_refuses_before_anything_is_taken(array $attrs, string $reason): void
    {
        $u = $this->player();
        $u->forceFill($attrs)->save();
        $this->topUp($u, 1000);
        $c = $this->competition('draw');
        try {
            $this->buy($u->refresh(), $c, 4);
            $this->fail('Checkout was allowed');
        } catch (RefusedException $e) {
            $this->assertSame(PlayCheck::MESSAGES[$reason], $e->getMessage());
            $this->assertSame($reason, $e->reason);
        }
        $this->assertSame(1000, $this->wallet()->total($u));
        $this->assertSame(0, Order::query()->count());
        $this->assertSame($reason, app(PlayCheck::class)->block($u->refresh()));
    }

    public function test_sales_switch_off_refuses_every_order(): void
    {
        Setting::put('sales_open', '0');
        $u = $this->player();
        $this->topUp($u, 1000);
        $c = $this->competition('draw');
        $this->expectExceptionMessage('Entries open soon.');
        $this->buy($u, $c, 4);
    }

    public function test_card_payments_under_the_minimum_are_refused(): void
    {
        $u = $this->player();
        $this->topUp($u, 450);
        $c = $this->competition('draw');
        $this->expectExceptionMessage('Card payments start at £1.00.');
        $this->buy($u, $c, 20, 'card', true); // £5 - £4.50 wallet = 50p card
    }

    public function test_a_weekly_deposit_limit_counts_card_payments_in_progress(): void
    {
        $u = $this->player();
        $u->limits()->create(['weekly_deposit_pence' => 1000]);
        $c = $this->competition('draw');
        $this->buy($u, $c, 24, 'card', false); // £6 pending
        $this->expectExceptionMessage('weekly deposit limit');
        $this->buy($u->refresh(), $c, 20, 'card', false); // £5 more would be £11
    }

    public function test_credit_card_spend_is_capped_at_250_a_month(): void
    {
        $u = $this->player();
        $c = $this->competition('draw', ['price_pence' => 1000, 'max_per_person' => 100]);
        $o = $this->buy($u, $c, 20, 'card', false)['order']; // £200
        $this->gateway()->settle($o->gateway_ref, 'paid', 'credit');
        $this->orders()->syncWithGateway($o);
        $this->expectExceptionMessage('Credit card payments are limited');
        $this->buy($u->refresh(), $c, 6, 'card', false); // £60 more
    }

    public function test_a_deposit_credits_the_deposit_balance_only_after_the_gateway_says_paid(): void
    {
        $u = $this->player();
        $o = $this->orders()->deposit($u, 2000);
        $this->assertSame(0, $this->wallet()->total($u));
        $this->gateway()->settle($o->gateway_ref, 'paid');
        $this->orders()->syncWithGateway($o);
        $this->orders()->syncWithGateway($o->refresh());
        $this->assertSame(['deposit' => 2000, 'bonus' => 0, 'winnings' => 0], $this->wallet()->balances($u));
    }

    public function test_deposits_below_the_minimum_are_refused(): void
    {
        $this->expectExceptionMessage('The minimum top up is £5.00.');
        $this->orders()->deposit($this->player(), 499);
    }

    public function test_the_welcome_bonus_is_off_by_default_and_once_per_house_when_on(): void
    {
        $address = ['address_line1' => '1 High Street', 'postcode' => 'BS1 4DJ'];
        $a = $this->player($address);
        $o = $this->orders()->deposit($a, 2000);
        $this->gateway()->settle($o->gateway_ref, 'paid');
        $this->orders()->syncWithGateway($o);
        $this->assertSame(0, $this->wallet()->balances($a)['bonus'], 'off by default');

        Setting::put('signup_bonus_enabled', '1');
        $b = $this->player($address + ['first_name' => 'Other']);
        $o = $this->orders()->deposit($b, 2000);
        $this->gateway()->settle($o->gateway_ref, 'paid');
        $this->orders()->syncWithGateway($o);
        $this->assertSame(2000, $this->wallet()->balances($b)['bonus'], 'matched up to the £20 cap');

        $c = $this->player(['address_line1' => '1 high street ', 'postcode' => 'bs14dj']);
        $o = $this->orders()->deposit($c, 2000);
        $this->gateway()->settle($o->gateway_ref, 'paid');
        $this->orders()->syncWithGateway($o);
        $this->assertSame(0, $this->wallet()->balances($c)['bonus'], 'same house');
    }
}
