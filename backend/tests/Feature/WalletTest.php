<?php

namespace Tests\Feature;

use App\Exceptions\RefusedException;
use App\Models\LedgerEntry;
use App\Models\Order;
use Illuminate\Database\QueryException;
use Tests\TestCase;

class WalletTest extends TestCase
{
    public function test_balances_are_the_sum_of_the_ledger(): void
    {
        $u = $this->player();
        $this->topUp($u, 1000);
        $this->topUp($u, 300, 'winnings');
        $this->topUp($u, 200, 'bonus');
        $this->assertSame(['deposit' => 1000, 'bonus' => 200, 'winnings' => 300], $this->wallet()->balances($u));
        $this->assertSame(1500, $this->wallet()->total($u));
    }

    public function test_a_credit_with_the_same_reference_happens_once(): void
    {
        $u = $this->player();
        $this->wallet()->credit($u, 'winnings', 500, 'Win', 'verity-winner:1');
        $this->wallet()->credit($u, 'winnings', 500, 'Win', 'verity-winner:1');
        $this->assertSame(500, $this->wallet()->balances($u)['winnings']);
    }

    public function test_the_ledger_can_never_be_changed_or_deleted(): void
    {
        $u = $this->player();
        $this->topUp($u, 1000);
        $row = LedgerEntry::query()->firstOrFail();
        foreach ([fn () => $row->forceFill(['amount_pence' => 999999])->save(), fn () => $row->delete(), fn () => LedgerEntry::query()->delete()] as $attempt) {
            try {
                $attempt();
                $this->fail('The ledger accepted a change');
            } catch (QueryException $e) {
                $this->assertStringContainsString('append-only', $e->getMessage());
            }
        }
        $this->assertSame(1000, $this->wallet()->total($u));
    }

    public function test_spending_takes_deposit_then_bonus_then_winnings_and_bonus_pays_at_most_half(): void
    {
        $u = $this->player();
        $this->topUp($u, 300);
        $this->topUp($u, 5000, 'bonus');
        $this->topUp($u, 5000, 'winnings');
        $order = Order::query()->create(['number' => 'GG-TEST0001', 'user_id' => $u->id, 'order_type' => 'tickets', 'status' => 'created', 'total_pence' => 1000, 'card_pence' => 0]);
        $this->wallet()->spendForOrder($order, 1000, 1000);
        $order->refresh();
        $this->assertSame([300, 500, 200], [$order->paid_deposit_pence, $order->paid_bonus_pence, $order->paid_winnings_pence]);
        $this->assertSame(['deposit' => 0, 'bonus' => 4500, 'winnings' => 4800], $this->wallet()->balances($u));
        $this->assertSame(1000, $this->wallet()->spendable($u, 1000));
    }

    public function test_spending_is_all_or_nothing(): void
    {
        $u = $this->player();
        $this->topUp($u, 400);
        $this->topUp($u, 1000, 'bonus'); // only half a £10 basket can be bonus
        $order = Order::query()->create(['number' => 'GG-TEST0002', 'user_id' => $u->id, 'order_type' => 'tickets', 'status' => 'created', 'total_pence' => 1000, 'card_pence' => 0]);
        $this->expectException(RefusedException::class);
        try {
            $this->wallet()->spendForOrder($order, 1000, 1000);
        } finally {
            $this->assertSame(1400, $this->wallet()->total($u));
        }
    }

    public function test_release_gives_each_part_back_once_and_refuses_a_paid_order(): void
    {
        $u = $this->player();
        $this->topUp($u, 300);
        $this->topUp($u, 500, 'winnings');
        $order = Order::query()->create(['number' => 'GG-TEST0003', 'user_id' => $u->id, 'order_type' => 'tickets', 'status' => 'pending_payment', 'total_pence' => 800, 'card_pence' => 0]);
        $this->wallet()->spendForOrder($order, 800, 800);
        $this->wallet()->releaseOrder($order->refresh());
        $this->wallet()->releaseOrder($order);
        $this->assertSame(['deposit' => 300, 'bonus' => 0, 'winnings' => 500], $this->wallet()->balances($u));
        $order->forceFill(['status' => 'paid', 'paid_at' => now()])->save();
        $this->expectException(\LogicException::class);
        $this->wallet()->releaseOrder($order);
    }

    public function test_expired_bonus_is_written_off(): void
    {
        $u = $this->player();
        $this->wallet()->credit($u, 'bonus', 1000, 'Welcome bonus', 'b1', null, now()->subDay());
        $this->wallet()->credit($u, 'bonus', 300, 'Returned', 'b2', null, now()->addDays(10));
        $this->assertSame(1000, $this->wallet()->expireBonus($u));
        $this->assertSame(300, $this->wallet()->balances($u)['bonus']);
        $this->assertSame(0, $this->wallet()->expireBonus($u));
    }

    public function test_withdrawals_only_come_from_winnings(): void
    {
        $u = $this->player();
        $this->topUp($u, 5000);
        $this->topUp($u, 1000, 'winnings');
        $this->expectException(RefusedException::class);
        $this->wallet()->debitWinnings($u, 2000, 'Withdrawal', 'w1');
    }
}
