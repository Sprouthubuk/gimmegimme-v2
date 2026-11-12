<?php

namespace Tests;

use App\Models\Competition;
use App\Models\Setting;
use App\Models\User;
use App\Payments\FakeGateway;
use App\Payments\PaymentGateway;
use App\Services\Publishing;
use App\Services\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

abstract class TestCase extends BaseTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Setting::put('sales_open', '1');
        // Requests come from the Astro site, so Sanctum treats them as first-party (cookie session).
        $this->withHeader('Referer', 'https://gimme.test/');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    protected function gateway(): FakeGateway
    {
        return app(PaymentGateway::class);
    }

    protected function wallet(): Wallet
    {
        return app(Wallet::class);
    }

    protected function player(array $attrs = []): User
    {
        return User::factory()->create($attrs);
    }

    protected function admin(): User
    {
        return User::factory()->admin()->create();
    }

    protected function topUp(User $u, int $pence, string $bucket = 'deposit'): void
    {
        $this->wallet()->credit($u, $bucket, $pence, 'Test top up', 'test:'.Str::uuid(), null, $bucket === 'bonus' ? now()->addDays(30) : null);
    }

    /**
     * A published competition. Instant wins: $prizes is [[name, value_pence, quantity, type], …].
     * Every ticket of an instant competition can be made a winner by giving prizes for all of them.
     */
    protected function competition(string $type = 'draw', array $attrs = [], array $prizes = [], bool $publish = true): Competition
    {
        $c = Competition::query()->create($attrs + [
            'slug' => 'comp-'.Str::lower(Str::random(6)),
            'title' => ucfirst($type).' Competition '.Str::random(4),
            'type' => $type,
            'game' => $type === 'instant' ? 'scratch_card' : null,
            'image' => '/media/test.webp',
            'price_pence' => 25,
            'max_tickets' => 1000,
            'max_per_person' => 100,
            'closes_at' => now()->addDays(7),
            'end_prize_name' => $type === 'draw' ? 'Cash Prize' : null,
            'end_prize_value_pence' => $type === 'draw' ? 100000 : null,
        ]);
        if ($type === 'instant') {
            foreach ($prizes ?: [['£5 Credit', 500, 10, 'site_credit']] as $i => [$name, $value, $qty, $ptype]) {
                $c->prizes()->create(['name' => $name, 'value_pence' => $value, 'quantity' => $qty, 'type' => $ptype, 'sort' => $i]);
            }
        }

        return $publish ? app(Publishing::class)->publish($c, $this->admin()) : $c;
    }
}
