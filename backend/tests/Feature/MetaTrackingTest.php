<?php

namespace Tests\Feature;

use App\Models\MetaEvent;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;
use App\Tracking\MetaEvents;
use Illuminate\Http\Client\Request as SentRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class MetaTrackingTest extends TestCase
{
    private const FBP = 'fb.1.1763700000000.1234567890';

    private const FBC = 'fb.1.1763700000000.IwAR0abcdefghijklmnop_qrs-tu';

    protected function setUp(): void
    {
        parent::setUp();
        Setting::put('meta_pixel_id', '977064968058757');
        config(['services.meta.capi_token' => 'test-token']);
        Http::fake(['graph.facebook.com/*' => fn () => array_shift($this->replies) ?? Http::response(['events_received' => 1])]);
    }

    /** Replies Meta gives, in order, before going back to "received". */
    private array $replies = [];

    private function buy(User $u, bool $consent, string $payWith = 'card', int $qty = 10, ?bool $useWallet = null)
    {
        $c = $this->competition('draw');
        $req = $consent ? $this->withCredentials()->withUnencryptedCookies(['gg_consent' => 'accepted', '_fbp' => self::FBP, '_fbc' => self::FBC]) : $this;

        return $req->actingAs($u)->withHeader('User-Agent', 'Mozilla/5.0 (iPhone)')->postJson('/api/checkout', [
            'lines' => [['competitionId' => $c->id, 'quantity' => $qty]], 'payWith' => $payWith, 'useWallet' => $useWallet ?? $payWith === 'wallet', 'requestId' => (string) Str::uuid(),
        ])->assertCreated();
    }

    private function sentEvents(): array
    {
        return collect(Http::recorded())->map(fn ($pair) => $pair[0])
            ->filter(fn (SentRequest $r) => str_contains($r->url(), 'graph.facebook.com'))
            ->flatMap(fn (SentRequest $r) => $r->data()['data'])->values()->all();
    }

    public function test_nothing_is_kept_or_sent_without_cookie_consent(): void
    {
        $u = $this->player();
        $number = $this->buy($u, false)->json('order.number');
        $this->gateway()->settle(Order::query()->where('number', $number)->value('gateway_ref'), 'paid');
        $this->postJson('/api/webhooks/cashflows', ['paymentJobReference' => Order::query()->where('number', $number)->value('gateway_ref')])->assertOk();
        $this->artisan('gimme:meta-events')->assertSuccessful();
        $this->assertSame(0, MetaEvent::query()->count());
        Http::assertNothingSent();
    }

    public function test_a_card_purchase_is_sent_once_from_the_server_when_paid_even_if_the_buyer_never_comes_back(): void
    {
        $u = $this->player(['phone' => '07700 900123', 'city' => 'Bristol', 'postcode' => 'BS11 0RJ']);
        $number = $this->buy($u, true)->json('order.number');
        $order = Order::query()->where('number', $number)->firstOrFail();

        // Not paid yet: nothing goes.
        $this->artisan('gimme:meta-events');
        Http::assertNothingSent();
        $this->assertSame('waiting', MetaEvent::query()->value('status'));

        // Paid at Cashflows; the webhook confirms it; the buyer closes the tab.
        $this->gateway()->settle($order->gateway_ref, 'paid');
        $this->postJson('/api/webhooks/cashflows', ['paymentJobReference' => $order->gateway_ref])->assertOk();
        $this->artisan('gimme:meta-events');
        $this->artisan('gimme:meta-events'); // a second run sends nothing more

        $events = $this->sentEvents();
        $this->assertCount(1, $events);
        $e = $events[0];
        $this->assertSame('Purchase', $e['event_name']);
        $this->assertSame($number, $e['event_id']); // the same id as the browser pixel: Meta counts it once
        $this->assertSame('website', $e['action_source']);
        $this->assertSame(['currency' => 'GBP', 'value' => round($order->total_pence / 100, 2)], array_intersect_key($e['custom_data'], ['currency' => 1, 'value' => 1]));
        $this->assertSame(10, $e['custom_data']['num_items']);
        $this->assertSame(self::FBP, $e['user_data']['fbp']);
        $this->assertSame(self::FBC, $e['user_data']['fbc']);
        $this->assertSame('Mozilla/5.0 (iPhone)', $e['user_data']['client_user_agent']);
        $this->assertSame([hash('sha256', strtolower($u->email))], $e['user_data']['em']);
        $this->assertSame([hash('sha256', '447700900123')], $e['user_data']['ph']);
        $this->assertSame([hash('sha256', 'bs110')], $e['user_data']['zp']);
        $this->assertSame([hash('sha256', (string) $u->id)], $e['user_data']['external_id']);
        $this->assertSame('sent', MetaEvent::query()->value('status'));
        Http::assertSent(fn (SentRequest $r) => str_contains($r->url(), '/v25.0/977064968058757/events') && str_contains($r->url(), 'access_token=test-token'));
    }

    public function test_no_personal_detail_leaves_unhashed(): void
    {
        $u = $this->player(['phone' => '07700 900123', 'city' => 'Bristol', 'postcode' => 'BS11 0RJ']);
        $this->topUp($u, 5000);
        $this->buy($u, true, 'wallet');
        $this->artisan('gimme:meta-events');
        $this->assertCount(1, $this->sentEvents());
        $body = json_encode($this->sentEvents());
        foreach ([$u->email, $u->first_name, $u->last_name, '07700', 'Bristol', 'BS11', $u->date_of_birth->format('Y-m-d')] as $plain) {
            $this->assertStringNotContainsStringIgnoringCase($plain, $body);
        }
    }

    public function test_purchase_value_is_real_money_only_never_bonus_credit(): void
    {
        $u = $this->player();
        $this->topUp($u, 5000, 'bonus');
        $this->topUp($u, 100);
        // 20 tickets at 25p: £1 deposit, then bonus up to half the basket, the rest by card.
        $number = $this->buy($u, true, 'card', 20, true)->json('order.number');
        $order = Order::query()->where('number', $number)->firstOrFail();
        $this->gateway()->settle($order->gateway_ref, 'paid');
        $this->postJson('/api/webhooks/cashflows', ['paymentJobReference' => $order->gateway_ref])->assertOk();
        $order->refresh();
        $this->assertGreaterThan(0, $order->paid_bonus_pence);
        $this->artisan('gimme:meta-events');
        $value = $this->sentEvents()[0]['custom_data']['value'];
        $this->assertSame(round(($order->total_pence - $order->paid_bonus_pence) / 100, 2), $value);
        // The order page tells the browser pixel the same value.
        $this->actingAs($u)->getJson("/api/orders/{$number}")->assertJsonPath('trackValuePence', $order->total_pence - $order->paid_bonus_pence);
    }

    public function test_an_order_paid_only_with_bonus_credit_is_not_reported_as_a_sale(): void
    {
        $u = $this->player();
        $this->topUp($u, 5000, 'bonus');
        $this->topUp($u, 5000, 'deposit');
        // Bonus pays at most half, so build the row by hand for an order whose real money is 0.
        $o = Order::query()->create(['number' => 'GG-TEST1', 'user_id' => $u->id, 'order_type' => 'tickets', 'status' => 'paid', 'total_pence' => 100,
            'card_pence' => 0, 'wallet_pence' => 100, 'paid_bonus_pence' => 100, 'paid_at' => now()]);
        MetaEvent::query()->create(['event_name' => 'Purchase', 'event_id' => $o->number, 'user_id' => $u->id, 'order_id' => $o->id, 'status' => 'ready', 'context' => []]);
        $this->artisan('gimme:meta-events');
        Http::assertNothingSent();
        $this->assertSame('skipped', MetaEvent::query()->value('status'));
    }

    public function test_sign_up_and_top_up_are_sent_with_the_ids_the_browser_uses(): void
    {
        $me = $this->withCredentials()->withUnencryptedCookies(['gg_consent' => 'accepted', '_fbp' => self::FBP])->postJson('/api/auth/register', [
            'firstName' => 'Sam', 'lastName' => 'Jones', 'email' => 'sam@example.com', 'password' => 'a-long-password', 'dateOfBirth' => '1990-05-01',
        ])->assertCreated()->json();
        $u = User::query()->findOrFail($me['id']);
        $u->forceFill(['email_verified_at' => now()])->save();
        $number = $this->withCredentials()->withUnencryptedCookies(['gg_consent' => 'accepted', '_fbp' => self::FBP])->actingAs($u)
            ->postJson('/api/me/deposits', ['amountPence' => 1000])->assertCreated()->json('orderNumber');
        $order = Order::query()->where('number', $number)->firstOrFail();
        $this->gateway()->settle($order->gateway_ref, 'paid');
        $this->postJson('/api/webhooks/cashflows', ['paymentJobReference' => $order->gateway_ref])->assertOk();
        $this->artisan('gimme:meta-events');

        $events = collect($this->sentEvents())->keyBy('event_name');
        $this->assertSame('reg-'.$me['id'], $events['CompleteRegistration']['event_id']);
        $this->assertSame($number, $events['Deposit']['event_id']);
        $this->assertSame(10.0, (float) $events['Deposit']['custom_data']['value']);
    }

    public function test_a_failure_is_retried_and_the_token_is_never_logged_or_kept(): void
    {
        $this->replies = [Http::response(['error' => ['message' => 'Invalid parameter for sam@example.com', 'type' => 'OAuthException', 'code' => 100]], 400)];
        $u = $this->player();
        $this->topUp($u, 5000);
        $this->buy($u, true, 'wallet');
        $this->artisan('gimme:meta-events');
        $row = MetaEvent::query()->firstOrFail();
        $this->assertSame('failed', $row->status);
        $this->assertStringContainsString('OAuthException 100', $row->last_error);
        $this->assertStringNotContainsString('sam@', $row->last_error); // Meta's message is never stored
        $this->artisan('gimme:meta-events');
        $this->assertSame('sent', $row->refresh()->status);
        $this->assertStringNotContainsString('test-token', json_encode(MetaEvent::query()->get()));
    }

    public function test_without_a_token_or_pixel_nothing_is_sent_and_checkout_still_works(): void
    {
        config(['services.meta.capi_token' => null]);
        $u = $this->player();
        $this->topUp($u, 5000);
        $this->buy($u, true, 'wallet');
        $this->artisan('gimme:meta-events');
        Http::assertNothingSent();
        $this->assertSame('ready', MetaEvent::query()->value('status')); // sent once the token is added

        Setting::put('meta_pixel_id', '');
        $this->buy($u, true, 'wallet');
        $this->assertSame(1, MetaEvent::query()->count());
    }

    public function test_the_test_event_code_from_the_admin_goes_with_the_events(): void
    {
        Setting::put('meta_test_event_code', 'TEST12345');
        $u = $this->player();
        $this->topUp($u, 5000);
        $this->buy($u, true, 'wallet');
        $this->artisan('gimme:meta-events');
        Http::assertSent(fn (SentRequest $r) => ($r->data()['test_event_code'] ?? null) === 'TEST12345');
    }

    public function test_events_older_than_seven_days_expire(): void
    {
        $u = $this->player();
        $o = Order::query()->create(['number' => 'GG-OLD1', 'user_id' => $u->id, 'order_type' => 'tickets', 'status' => 'pending_payment', 'total_pence' => 500, 'card_pence' => 500]);
        $row = MetaEvent::query()->create(['event_name' => 'Purchase', 'event_id' => $o->number, 'user_id' => $u->id, 'order_id' => $o->id, 'status' => 'waiting', 'context' => []]);
        $row->forceFill(['created_at' => now()->subDays(8)])->saveQuietly();
        $this->artisan('gimme:meta-events');
        $this->assertSame('expired', $row->refresh()->status);
        Http::assertNothingSent();
    }

    public function test_the_hashes_follow_metas_normalising_rules(): void
    {
        $u = $this->player(['first_name' => " Zoë-Ann ", 'phone' => '+44 (0)7700 900123', 'postcode' => 'sw1a 1aa']);
        $d = MetaEvents::userData($u);
        $this->assertSame([hash('sha256', 'zoëann')], $d['fn']);
        $this->assertSame([hash('sha256', 'sw1a1')], $d['zp']);
        $this->assertSame([hash('sha256', 'gb')], $d['country']);
        $this->assertSame([hash('sha256', '447700900123')], $d['ph']);
    }
}
