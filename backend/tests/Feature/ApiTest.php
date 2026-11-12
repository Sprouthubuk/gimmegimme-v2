<?php

namespace Tests\Feature;

use App\Models\ContactMessage;
use App\Models\Order;
use App\Models\PrizeClaim;
use App\Models\PromoCode;
use App\Models\User;
use App\Models\Withdrawal;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Sprouthub\Verity\Facades\Verity;
use Sprouthub\Verity\Models\Competition;
use Tests\TestCase;

class ApiTest extends TestCase
{
    private function checkout(User $u, $c, int $qty, array $extra = [])
    {
        return $this->actingAs($u)->postJson('/api/checkout', $extra + [
            'lines' => [['competitionId' => $c->id, 'quantity' => $qty]], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid(),
        ]);
    }

    public function test_site_and_competition_listing(): void
    {
        $draw = $this->competition('draw', ['featured' => true]);
        $instant = $this->competition('instant', [], [['£100 Cash', 10000, 1, 'cash'], ['50p Credit', 50, 200, 'site_credit']]);
        $this->competition('draw', [], [], false); // not published: never listed

        $this->getJson('/api/site')->assertOk()->assertJson(['salesOpen' => true, 'minDepositPence' => 500, 'minCardPence' => 100, 'featuredSlug' => $draw->slug]);
        $list = $this->getJson('/api/competitions')->assertOk()->json('data');
        $this->assertSame([$draw->slug, $instant->slug], array_column($list, 'slug'));
        $this->assertSame('live', $list[1]['status']);
        $this->assertSame(10000, $list[1]['topPrizePence']);
        $this->assertSame('Scratch Card', $list[1]['gameLabel']);

        $d = $this->getJson('/api/competitions/'.$instant->slug)->assertOk()->json();
        $this->assertSame(['£100 Cash', '50p Credit'], array_column($d['prizes'], 'name'));
        $this->assertSame(0, $d['heldByMe']);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $d['commitment']);
        $this->assertStringStartsWith('VTY-', $d['verityRef']);
        // No winning ticket numbers, anywhere in the answer.
        $this->assertStringNotContainsStringIgnoringCase('ticket_number', json_encode($d));
        $this->assertArrayNotHasKey('winningTickets', $d);
        $this->getJson('/api/competitions/nope')->assertNotFound();
    }

    public function test_sign_up_refuses_under_18s_and_signs_a_new_player_in(): void
    {
        Notification::fake();
        $base = ['firstName' => 'Sam', 'lastName' => 'Jones', 'email' => 'Sam@Example.com', 'password' => 'correct-horse', 'marketingOptIn' => false];
        $this->postJson('/api/auth/register', $base + ['dateOfBirth' => now()->subYears(18)->addDay()->toDateString()])
            ->assertStatus(422)->assertJsonPath('errors.dateOfBirth.0', 'You must be 18 or over to join.');
        $me = $this->postJson('/api/auth/register', $base + ['dateOfBirth' => '1990-05-05'])->assertCreated()->json();
        $this->assertSame('sam@example.com', $me['email']);
        $this->assertFalse($me['emailVerified']);
        $this->assertSame('email_unverified', $me['playBlock']);
        $this->assertFalse(User::query()->first()->marketing_email);
        $this->getJson('/api/me')->assertOk()->assertJsonPath('firstName', 'Sam');
        Notification::assertSentTo(User::query()->first(), VerifyEmail::class);
        $this->postJson('/api/auth/register', $base + ['dateOfBirth' => '1990-05-05'])->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_the_email_link_confirms_and_sends_the_player_to_the_site(): void
    {
        $u = $this->player(['email_verified_at' => null]);
        $url = URL::temporarySignedRoute('verification.verify', now()->addHour(), ['id' => $u->id, 'hash' => sha1($u->email)]);
        $this->get($url)->assertRedirect('https://gimme.test/verify-email?status=verified');
        $this->assertTrue($u->refresh()->hasVerifiedEmail());
        $this->get(str_replace('signature=', 'signature=x', $url))->assertForbidden();
    }

    public function test_login_logout_and_password_reset(): void
    {
        Notification::fake();
        $u = $this->player(['email' => 'p@example.com']);
        $this->postJson('/api/auth/login', ['email' => 'p@example.com', 'password' => 'wrong'])->assertStatus(422);
        $this->postJson('/api/auth/login', ['email' => 'P@example.com ', 'password' => 'password'])->assertOk()->assertJsonPath('email', 'p@example.com');
        $this->postJson('/api/auth/logout')->assertNoContent();
        $this->postJson('/api/auth/forgot-password', ['email' => 'nobody@example.com'])->assertNoContent();
        $this->postJson('/api/auth/forgot-password', ['email' => 'p@example.com'])->assertNoContent();
        $token = null;
        Notification::assertSentTo($u, ResetPassword::class, function ($n) use (&$token) {
            $token = $n->token;

            return true;
        });
        $this->postJson('/api/auth/reset-password', ['token' => 'bad', 'email' => 'p@example.com', 'password' => 'new-password-1'])->assertStatus(422);
        $this->postJson('/api/auth/reset-password', ['token' => $token, 'email' => 'p@example.com', 'password' => 'new-password-1'])->assertNoContent();
        $this->postJson('/api/auth/login', ['email' => 'p@example.com', 'password' => 'new-password-1'])->assertOk();
    }

    public function test_a_closed_account_cannot_log_in(): void
    {
        $this->player(['email' => 'gone@example.com'])->forceFill(['closed_at' => now()])->save();
        $this->postJson('/api/auth/login', ['email' => 'gone@example.com', 'password' => 'password'])->assertStatus(422);
    }

    public function test_account_endpoints_need_a_session(): void
    {
        foreach (['/api/me', '/api/me/tickets', '/api/me/limits', '/api/orders/GG-X'] as $p) {
            $this->getJson($p)->assertUnauthorized();
        }
        $this->postJson('/api/checkout', [])->assertUnauthorized();
    }

    public function test_wallet_checkout_then_play_reveals_this_orders_tickets_once(): void
    {
        $u = $this->player();
        $this->topUp($u, 1000);
        $c = $this->competition('instant', ['max_tickets' => 50, 'max_per_person' => 50], [['50p Credit', 50, 50, 'site_credit']]);

        $res = $this->checkout($u, $c, 4)->assertCreated()->assertJsonPath('next', 'play')->json();
        $number = $res['order']['number'];
        $this->getJson('/api/me')->assertJsonPath('gamesWaiting', 4)->assertJsonPath('wallet.winningsPence', 200);
        $order = $this->getJson("/api/orders/{$number}")->assertOk()->assertJsonPath('toPlay', 4)->json();
        $this->assertCount(4, $order['lines'][0]['tickets']);
        // Before watching, My Tickets doesn't give the result away.
        $g = $this->getJson('/api/me/tickets?tab=to-play')->json('data.0');
        $this->assertSame(4, $g['toPlay']);
        $this->assertSame([false, false, false, false], array_column($g['tickets'], 'won'));

        $play = $this->postJson("/api/orders/{$number}/play")->assertOk()->json();
        $this->assertSame($number, $play['outcome']['purchaseId']);
        $this->assertCount(4, $play['outcome']['tickets']);
        $this->assertSame(200, $play['outcome']['totalWonPence']);
        $this->assertSame(200, $play['outcome']['creditedPence']);
        $this->assertSame(['scratch_card', true], [$play['context'][$c->id]['game'], $play['context'][$c->id]['isInstantWin']]);
        $this->assertSame($play['outcome'], $this->postJson("/api/orders/{$number}/play")->json('outcome'), 'same result again');
        $this->getJson('/api/me')->assertJsonPath('gamesWaiting', 0)->assertJsonPath('wallet.winningsPence', 200);
        $this->assertSame(200, $this->getJson('/api/me/tickets?tab=won')->json('data.0.wonPence'));
    }

    public function test_card_checkout_redirects_and_the_return_page_confirms_after_asking_the_gateway(): void
    {
        $u = $this->player();
        $c = $this->competition('draw');
        $res = $this->checkout($u, $c, 8, ['payWith' => 'card'])->assertCreated()->json();
        $this->assertSame('redirect', $res['next']);
        $number = $res['order']['number'];
        $this->postJson("/api/orders/{$number}/return")->assertOk()->assertJsonPath('status', 'pending_payment');
        $this->postJson("/api/orders/{$number}/play")->assertStatus(409);

        $order = Order::query()->where('number', $number)->first();
        $this->get(parse_url($res['redirectUrl'], PHP_URL_PATH).'/paid')->assertRedirect("https://gimme.test/order/{$number}");
        $this->postJson("/api/orders/{$number}/return")->assertOk()->assertJsonPath('status', 'paid');
        $this->assertCount(8, $order->lines()->first()->tickets);
    }

    public function test_the_webhook_finds_orders_only_by_the_stored_job_and_asks_the_gateway(): void
    {
        $u = $this->player();
        $c = $this->competition('draw');
        $number = $this->checkout($u, $c, 8, ['payWith' => 'card'])->json('order.number');
        $order = Order::query()->where('number', $number)->first();
        auth()->forgetGuards();

        $this->postJson('/api/webhooks/cashflows', ['paymentJobReference' => '../x'])->assertStatus(400);
        $this->postJson('/api/webhooks/cashflows', ['paymentJobReference' => 'UNKNOWN-1', 'orderNumber' => $number])->assertOk();
        // A notification saying "paid" changes nothing until the gateway itself says so.
        $this->postJson('/api/webhooks/cashflows', ['paymentJobReference' => $order->gateway_ref, 'status' => 'Paid'])->assertOk();
        $this->assertSame('pending_payment', $order->refresh()->status);
        $this->gateway()->settle($order->gateway_ref, 'paid');
        $this->postJson('/api/webhooks/cashflows', ['paymentJobReference' => $order->gateway_ref])->assertOk();
        $this->assertSame('paid', $order->refresh()->status);
    }

    public function test_cancelled_return_closes_the_order_and_gives_the_wallet_back(): void
    {
        $u = $this->player();
        $this->topUp($u, 300);
        $c = $this->competition('draw');
        $number = $this->checkout($u, $c, 20, ['payWith' => 'card'])->json('order.number');
        $this->getJson('/api/me')->assertJsonPath('wallet.totalPence', 0);
        $this->postJson("/api/orders/{$number}/return", ['leftAs' => 'cancelled'])->assertJsonPath('status', 'cancelled');
        $this->getJson('/api/me')->assertJsonPath('wallet.totalPence', 300);
    }

    public function test_orders_are_private_to_their_owner(): void
    {
        $a = $this->player();
        $this->topUp($a, 1000);
        $number = $this->checkout($a, $this->competition('draw'), 4)->json('order.number');
        $b = $this->player();
        $this->actingAs($b)->getJson("/api/orders/{$number}")->assertNotFound();
        $this->actingAs($b)->postJson("/api/orders/{$number}/play")->assertNotFound();
        $this->actingAs($b)->postJson("/api/orders/{$number}/return")->assertNotFound();
    }

    public function test_checkout_refusals_come_back_with_a_reason(): void
    {
        $u = $this->player(['self_excluded_until' => null]);
        $c = $this->competition('draw', ['max_per_person' => 10]);
        $this->checkout($u, $c, 11)->assertStatus(422)->assertJsonPath('message', $c->title.': You can buy 10 more tickets for this competition.');
        $this->checkout($u, $c, 4)->assertStatus(422)->assertJsonPath('code', 'not_enough_wallet');
        $this->checkout($u, $c, 4, ['payWith' => 'bitcoin'])->assertStatus(422)->assertJsonValidationErrors('payWith');
        $this->checkout($u, $c, 4, ['requestId' => '../x'])->assertStatus(422);
    }

    public function test_basket_pricing_works_signed_out_and_applies_promo_codes_up_to_half(): void
    {
        $c = $this->competition('draw', ['price_pence' => 100]);
        PromoCode::query()->create(['code' => 'half', 'percent_off' => 50]);
        $p = $this->postJson('/api/basket/price', ['lines' => [['competitionId' => $c->id, 'quantity' => 3], ['competitionId' => $c->id, 'quantity' => 2]], 'promoCode' => 'HALF'])->assertOk()->json();
        $this->assertSame(1, count($p['lines']), 'one line per competition');
        $this->assertSame(5, $p['lines'][0]['quantity']);
        $this->assertSame(['code' => 'HALF', 'discountPence' => 250], $p['promo']);
        $this->assertSame(250, $p['totalPence']);
        $this->assertFalse($p['walletCovers']);
        $this->assertSame(["That promo code isn't valid."], $this->postJson('/api/basket/price', ['lines' => [['competitionId' => $c->id, 'quantity' => 1]], 'promoCode' => 'NOPE'])->json('problems'));
        $this->expectException(\DomainException::class);
        PromoCode::query()->create(['code' => 'free', 'percent_off' => 100]);
    }

    public function test_limits_lower_at_once_and_raise_after_24_hours(): void
    {
        $u = $this->player();
        $this->actingAs($u)->postJson('/api/me/limits', ['weeklyDepositPence' => 5000])->assertOk()->assertJsonPath('weeklyDepositPence', 5000);
        $this->postJson('/api/me/limits', ['weeklyDepositPence' => 2000])->assertJsonPath('weeklyDepositPence', 2000)->assertJsonPath('pending', null);
        $r = $this->postJson('/api/me/limits', ['weeklyDepositPence' => 9000])->assertJsonPath('weeklyDepositPence', 2000)->json();
        $this->assertSame(9000, $r['pending']['weeklyDepositPence']);
        $this->postJson('/api/me/limits', ['weeklyDepositPence' => null])->assertJsonPath('weeklyDepositPence', 2000)->assertJsonPath('pending.weeklyDepositPence', null);
        $this->postJson('/api/me/limits', ['weeklyDepositPence' => 100])->assertStatus(422);
    }

    public function test_breaks_and_self_exclusion_apply_at_once_and_cannot_be_shortened(): void
    {
        $u = $this->player(['marketing_email' => true]);
        $this->actingAs($u)->postJson('/api/me/break', ['days' => 7])->assertOk();
        $this->postJson('/api/me/break', ['days' => 1])->assertOk();
        $this->assertTrue($u->refresh()->cool_off_until->gt(now()->addDays(6)));
        $this->getJson('/api/me')->assertJsonPath('playBlock', 'cool_off');

        $this->postJson('/api/me/self-exclude', ['months' => 6])->assertOk();
        $this->assertFalse($u->refresh()->marketing_email);
        $this->getJson('/api/me')->assertJsonPath('playBlock', 'self_excluded');
        $this->patchJson('/api/me/preferences', ['email' => true, 'sms' => true, 'winNotifications' => true])->assertJsonPath('marketing.email', false);
        $this->postJson('/api/me/self-exclude', ['months' => 3])->assertStatus(422);
    }

    public function test_address_is_fill_once_and_postcodes_are_tidied(): void
    {
        $u = $this->player();
        $this->actingAs($u)->patchJson('/api/me/address', ['line1' => '1 High St', 'city' => 'Bristol', 'postcode' => 'bs14dj'])->assertOk()->assertJsonPath('address.postcode', 'BS1 4DJ');
        $this->patchJson('/api/me/address', ['line1' => 'Elsewhere', 'city' => 'Bath', 'postcode' => 'BA1 1AA'])->assertStatus(422)->assertJsonPath('code', 'fill_once');
        $this->patchJson('/api/me/profile', ['phone' => '07700 900123'])->assertJsonPath('phone', '07700 900123');
        $this->patchJson('/api/me/profile', ['phone' => '<script>'])->assertStatus(422);
    }

    public function test_deposits_and_withdrawals(): void
    {
        $u = $this->player();
        $r = $this->actingAs($u)->postJson('/api/me/deposits', ['amountPence' => 2000])->assertCreated()->json();
        $this->assertStringContainsString('/api/fake-pay/', $r['redirectUrl']);
        $this->postJson('/api/me/deposits', ['amountPence' => 400])->assertStatus(422);

        $this->topUp($u, 5000, 'winnings');
        $this->postJson('/api/me/withdrawals', ['amountPence' => 1999])->assertStatus(422)->assertJsonPath('code', 'withdrawal_minimum');
        $this->postJson('/api/me/withdrawals', ['amountPence' => 2000])->assertStatus(403)->assertJsonPath('code', 'id_required');
        $u->forceFill(['id_verified_at' => now()])->save();
        $this->postJson('/api/me/withdrawals', ['amountPence' => 9000])->assertStatus(422);
        $this->postJson('/api/me/withdrawals', ['amountPence' => 2000])->assertCreated();
        $this->assertSame(1, Withdrawal::query()->count());
        $this->getJson('/api/me')->assertJsonPath('wallet.winningsPence', 3000);
    }

    public function test_contact_messages_are_saved_and_rate_limited(): void
    {
        $msg = ['name' => 'A', 'email' => 'a@example.com', 'topic' => 'Help', 'message' => 'Hello there, a question.'];
        $this->postJson('/api/contact', ['email' => 'x'])->assertStatus(422);
        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/contact', $msg)->assertNoContent();
        }
        $this->postJson('/api/contact', $msg)->assertStatus(429);
        $this->assertSame(4, ContactMessage::query()->count());
    }

    public function test_winners_entry_lists_and_names_after_a_real_draw(): void
    {
        $u = $this->player(['first_name' => 'Liam', 'last_name' => 'Oakes']);
        $this->topUp($u, 1000);
        $c = $this->competition('draw', ['closes_at' => now()->addMinutes(30)]);
        $this->checkout($u, $c, 4)->assertCreated();
        $this->getJson('/api/entry-lists/'.$c->slug)->assertNotFound();

        Carbon::setTestNow(now()->addMinutes(31));
        Verity::close($c->verity_ref);
        Carbon::setTestNow(now()->addMinutes(5));
        Verity::draw($c->verity_ref);

        $d = $this->getJson('/api/winners/draws')->assertOk()->json('data.0');
        $this->assertSame('Liam O.', $d['name']);
        $this->assertSame('Cash Prize', $d['prizeName']);
        $this->assertSame(1, PrizeClaim::query()->where('kind', 'draw')->count());
        $resp = $this->getJson('/api/entry-lists/'.$c->slug);
        $this->assertSame(200, $resp->status(), (string) Competition::query()->value('status').' '.$resp->getContent());
        $list = $resp->json();
        $this->assertSame(4, $list['total']);
        $this->assertSame('L*** O.', $list['data'][0]['name']);
        $this->assertSame('drawn', $this->getJson('/api/me/tickets?tab=past')->json('data.0.competition.status'));
    }
}
