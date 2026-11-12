<?php

namespace Tests\Feature;

use App\Services\Orders;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

class JobsTest extends TestCase
{
    public function test_the_sweep_confirms_paid_expires_abandoned_and_catches_late_payments(): void
    {
        $u = $this->player();
        $this->topUp($u, 200);
        $c = $this->competition('draw');
        $orders = app(Orders::class);
        $buy = fn () => $orders->checkout($u->refresh(), [['competitionId' => $c->id, 'quantity' => 8]], 'card', false, null, (string) Str::uuid())['order'];
        $paid = $buy();
        $abandoned = $buy();
        $this->gateway()->settle($paid->gateway_ref, 'paid');

        Carbon::setTestNow(now()->addMinutes(61));
        $this->artisan('orders:sweep')->assertSuccessful();
        $this->assertSame('paid', $paid->refresh()->status);
        $this->assertSame('expired', $abandoned->refresh()->status);

        $this->gateway()->settle($abandoned->gateway_ref, 'paid');
        Carbon::setTestNow(now()->addMinutes(5));
        $this->artisan('orders:sweep')->assertSuccessful();
        $this->assertSame('paid', $abandoned->refresh()->status);
        $this->assertTrue($abandoned->needs_attention);
    }

    public function test_limit_raises_apply_after_24_hours_and_expired_bonus_goes(): void
    {
        $u = $this->player();
        $u->limits()->create(['weekly_deposit_pence' => 1000, 'pending_weekly_deposit_pence' => 5000, 'pending_applies_at' => now()->addDay()]);
        $this->wallet()->credit($u, 'bonus', 700, 'Welcome bonus', 'b-1', null, now()->addDays(2));
        $this->artisan('players:housekeeping')->assertSuccessful();
        $this->assertSame(1000, $u->limits()->first()->weekly_deposit_pence);

        Carbon::setTestNow(now()->addDays(3));
        $this->artisan('players:housekeeping')->assertSuccessful();
        $this->assertSame(5000, $u->limits()->first()->weekly_deposit_pence);
        $this->assertSame(0, $this->wallet()->balances($u)['bonus']);
    }

    public function test_the_schedule_includes_verity_and_our_jobs(): void
    {
        $this->artisan('schedule:list')->expectsOutputToContain('verity:process-due')->expectsOutputToContain('orders:sweep')->expectsOutputToContain('players:housekeeping');
    }
}
