<?php

namespace Tests\Feature;

use App\Services\DrawResults;
use App\Models\ContactMessage;
use App\Models\Order;
use App\Models\PrizeClaim;
use App\Models\PromoCode;
use App\Models\User;
use App\Models\Withdrawal;
use App\Notifications\PrizeWon;
use App\Payments\CashflowsGateway;
use App\Payments\PaymentGateway;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
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
        $this->assertSame(0, $list[1]['soldPercent']);
        $this->assertSame($list[1]['maxTickets'], $list[1]['ticketsLeft']); // counts shown since 22 Nov 2026

        $d = $this->getJson('/api/competitions/'.$instant->slug)->assertOk()->json();
        $this->assertSame(['£100 Cash', '50p Credit'], array_column($d['prizes'], 'name'));
        $this->assertSame(0, $d['heldByMe']);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $d['commitment']);
        $this->assertStringStartsWith('VTY-', $d['verityRef']);
        // The detail itself carries no ticket numbers: they are listed, paged, at /winning-numbers.
        $this->assertStringNotContainsStringIgnoringCase('ticket_number', json_encode($d));
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
        $this->assertSame('/verify/'.$c->refresh()->verity_ref, $play['outcome']['tickets'][0]['proofUrl'], 'each ticket links to its fairness record');
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
        $this->checkout($u, $c, 11)->assertStatus(422)->assertJsonPath('message', $c->title.': Not that many tickets are left. Please choose fewer.');
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

    public function test_a_zero_limit_applies_at_once_and_stops_all_paying_in(): void
    {
        $u = $this->player();
        $this->actingAs($u)->postJson('/api/me/limits', ['weeklyDepositPence' => 0])->assertOk()->assertJsonPath('weeklyDepositPence', 0)->assertJsonPath('pending', null);
        $this->postJson('/api/me/deposits', ['amountPence' => 500])->assertStatus(403)->assertJsonPath('code', 'spend_limit');
        $c = $this->competition('draw');
        $this->checkout($u, $c, 4, ['payWith' => 'card', 'useWallet' => false])->assertStatus(403)->assertJsonPath('code', 'spend_limit');
        // Raising it from £0 waits 24 hours like any other raise.
        $this->postJson('/api/me/limits', ['weeklyDepositPence' => 1000])->assertJsonPath('weeklyDepositPence', 0)->assertJsonPath('pending.weeklyDepositPence', 1000);
    }

    /** @return array<string, array{bool}> */
    public static function signUpChoices(): array
    {
        return ['box ticked' => [true], 'box left empty' => [false]];
    }

    /** @dataProvider signUpChoices */
    public function test_sign_up_dates_the_marketing_box_only_when_it_is_ticked(bool $ticked): void
    {
        Notification::fake();
        Carbon::setTestNow('2026-11-17 10:00:00');
        $this->postJson('/api/auth/register', ['firstName' => 'Sam', 'lastName' => 'Jones', 'email' => 'sam@example.com', 'password' => 'correct-horse',
            'dateOfBirth' => '1990-05-05', 'marketingOptIn' => $ticked])->assertCreated();
        $sam = User::query()->where('email', 'sam@example.com')->firstOrFail();
        $this->assertSame($ticked ? '2026-11-17 10:00:00' : null, $sam->marketing_email_consent_at?->toDateTimeString());
        $this->assertNull($sam->marketing_sms_consent_at);
        Carbon::setTestNow();
    }

    public function test_the_date_a_player_agrees_to_marketing_is_kept_and_goes_when_they_stop(): void
    {
        $sam = $this->player(['marketing_email' => true, 'marketing_email_consent_at' => '2026-11-17 10:00:00']);

        // Turning one on sets its date; leaving it on keeps the first date; turning it off clears it.
        Carbon::setTestNow('2026-11-18 09:00:00');
        $this->actingAs($sam)->patchJson('/api/me/preferences', ['email' => true, 'sms' => true, 'winNotifications' => true])->assertOk();
        $sam->refresh();
        $this->assertSame('2026-11-17 10:00:00', $sam->marketing_email_consent_at->toDateTimeString());
        $this->assertSame('2026-11-18 09:00:00', $sam->marketing_sms_consent_at->toDateTimeString());
        $this->patchJson('/api/me/preferences', ['email' => false, 'sms' => true, 'winNotifications' => true])->assertOk();
        $this->assertNull($sam->refresh()->marketing_email_consent_at);
        $this->assertNotNull($sam->marketing_sms_consent_at);
        $this->patchJson('/api/me/preferences', ['email' => true, 'sms' => true, 'winNotifications' => true])->assertOk();
        $this->assertNotNull($sam->refresh()->marketing_email_consent_at);

        // Self-exclusion clears both in the same save; after that, ticking the boxes changes nothing.
        $this->postJson('/api/me/self-exclude', ['months' => 6])->assertOk();
        $sam->refresh();
        $this->assertSame([false, false, null, null], [$sam->marketing_email, $sam->marketing_sms, $sam->marketing_email_consent_at, $sam->marketing_sms_consent_at]);
        $this->patchJson('/api/me/preferences', ['email' => true, 'sms' => true, 'winNotifications' => true])->assertOk();
        $this->assertNull($sam->refresh()->marketing_email_consent_at);
        $this->assertNull($sam->marketing_sms_consent_at);
        Carbon::setTestNow();
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
        $this->postJson('/api/me/withdrawals', ['amountPence' => 1999, 'accountName' => 'Liam Player', 'sortCode' => '12-34-56', 'accountNumber' => '12345678'])->assertStatus(422)->assertJsonPath('code', 'withdrawal_minimum');
        $this->postJson('/api/me/withdrawals', ['amountPence' => 2000, 'accountName' => 'Liam Player', 'sortCode' => '12-34-56', 'accountNumber' => '12345678'])->assertStatus(403)->assertJsonPath('code', 'id_required');
        $u->forceFill(['id_verified_at' => now()])->save();
        $this->postJson('/api/me/withdrawals', ['amountPence' => 9000, 'accountName' => 'Liam Player', 'sortCode' => '12-34-56', 'accountNumber' => '12345678'])->assertStatus(422);
        $this->postJson('/api/me/withdrawals', ['amountPence' => 2000, 'accountName' => 'Liam Player', 'sortCode' => '12-34-56', 'accountNumber' => '12345678'])->assertCreated();
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
        // Open while on sale, not only after the draw.
        $this->assertCount(4, $this->getJson('/api/entry-lists/'.$c->slug)->assertOk()->json('data'));
        $this->assertContains($c->slug, array_column($this->getJson('/api/entry-lists')->json('data'), 'slug'));

        Carbon::setTestNow(now()->addMinutes(31));
        Verity::close($c->verity_ref);
        Carbon::setTestNow(now()->addMinutes(5));
        Verity::draw($c->verity_ref);
        // Held for the live reveal (owner, 25 Nov 2026): nobody is told until it's published.
        $this->assertSame([], $this->getJson('/api/winners/draws')->json('data'));
        $this->assertSame(0, PrizeClaim::query()->count());
        $this->assertSame('closed', $this->actingAs($u)->getJson('/api/me/tickets?tab=past')->json('data.0.competition.status'));
        $this->assertTrue(app(DrawResults::class)->publish($c, null, 'auto'));

        $d = $this->getJson('/api/winners/draws')->assertOk()->json('data.0');
        $this->assertSame('Liam O.', $d['name']);
        $this->assertSame('Cash Prize', $d['prizeName']);
        $this->assertSame(1, PrizeClaim::query()->where('kind', 'draw')->count());
        $resp = $this->getJson('/api/entry-lists/'.$c->slug);
        $this->assertSame(200, $resp->status(), (string) Competition::query()->value('status').' '.$resp->getContent());
        $list = $resp->json();
        $this->assertCount(4, $list['data']);
        $this->assertArrayNotHasKey('total', $list);
        $this->assertSame('L*** O.', $list['data'][0]['name']);
        $this->assertSame('drawn', $this->getJson('/api/me/tickets?tab=past')->json('data.0.competition.status'));
    }

    public function test_winning_numbers_are_public_from_publish_and_marked_won_when_sold(): void
    {
        $c = $this->competition('instant', ['max_tickets' => 40, 'max_per_person' => 40], [['£100 Cash', 10000, 2, 'cash'], ['£5 Credit', 500, 8, 'site_credit']]);
        $this->competition('instant', [], [], false); // not published: no list
        $v = Competition::query()->where('ref', $c->verity_ref)->firstOrFail();
        $table = \Illuminate\Support\Facades\DB::table('verity_instant_tickets')->where('competition_id', $v->id)->pluck('ticket_number')->sort()->values()->all();

        // Before a single sale: all ten numbers, biggest prize first, none won.
        $list = $this->getJson('/api/competitions/'.$c->slug.'/winning-numbers')->assertOk()->json();
        $this->assertSame(10, $list['total']);
        $this->assertSame(0, $list['won']);
        $this->assertSame($table, collect($list['data'])->pluck('ticket')->sort()->values()->all());
        $this->assertSame(['£100 Cash', '£100 Cash'], array_slice(array_column($list['data'], 'prizeName'), 0, 2));
        $this->assertFalse(collect($list['data'])->contains('won', true));
        // The seed that made the table stays sealed until the end.
        $this->assertNull($v->revealed_seed);
        $this->assertStringNotContainsString('seed', json_encode($list));

        $u = $this->player(['first_name' => 'Amy', 'last_name' => 'Brook']);
        $this->topUp($u, 1000);
        $number = $this->checkout($u, $c, 20)->assertCreated()->json('order.number');
        $mine = \Sprouthub\Verity\Models\Entry::query()->where('competition_id', $v->id)->pluck('number')->all();
        // Until Amy has played her reveal, her wins are marked won but not named anywhere.
        $early = collect($this->getJson('/api/competitions/'.$c->slug.'/winning-numbers?show=won')->json('data'));
        $this->assertTrue($early->every(fn ($r) => $r['won'] && $r['winnerName'] === null));
        $this->assertSame([], $this->getJson('/api/winners/instant')->json('data'));
        $this->assertSame(0, collect($this->getJson('/api/entry-lists/'.$c->slug)->json('data'))->whereNotNull('prizeName')->count());
        $this->postJson("/api/orders/{$number}/play")->assertOk();
        $this->assertSame(50, $this->getJson('/api/competitions/'.$c->slug)->json('soldPercent'));

        $list = $this->getJson('/api/competitions/'.$c->slug.'/winning-numbers')->json();
        foreach ($list['data'] as $row) {
            $this->assertSame(in_array($row['ticket'], $mine, true), $row['won'], "ticket {$row['ticket']}");
            $this->assertSame($row['won'] ? 'Amy B.' : null, $row['winnerName']);
        }
        $won = collect($list['data'])->where('won', true)->count();
        $this->assertSame($won, $list['won']);
        $this->assertSame($won, $this->getJson('/api/competitions/'.$c->slug.'/winning-numbers?show=won')->json('matching'));
        $this->assertSame(10 - $won, $this->getJson('/api/competitions/'.$c->slug.'/winning-numbers?show=left')->json('matching'));
        $big = $this->getJson('/api/competitions/'.$c->slug.'/winning-numbers?prize='.urlencode('£100 Cash'))->json();
        $this->assertSame(2, $big['matching']);
        $this->assertSame(['£100 Cash'], array_values(array_unique(array_column($big['data'], 'prizeName'))));
        $one = $this->getJson('/api/competitions/'.$c->slug.'/winning-numbers?q='.$table[0])->json('data');
        $this->assertSame([$table[0]], array_column($one, 'ticket'));
        // The detail's won counts agree with the list.
        $this->assertSame($won, array_sum(array_column($this->getJson('/api/competitions/'.$c->slug)->json('prizes'), 'won')));

        // The entry list names the prize on each winning ticket.
        $entries = collect($this->getJson('/api/entry-lists/'.$c->slug)->json('data'));
        $this->assertSame($won, $entries->whereNotNull('prizeName')->count());
        $this->assertSame('A*** B.', $entries->first()['name']);

        $this->getJson('/api/competitions/'.$this->competition('draw')->slug.'/winning-numbers')->assertNotFound();
    }

    public function test_ticket_numbers_are_random_so_public_winning_numbers_give_no_edge(): void
    {
        // Every published competition uses random numbers, and Verity refuses in-order numbers with instant wins.
        $c = $this->competition('instant', ['max_tickets' => 1000]);
        $this->assertSame('random', Competition::query()->where('ref', $c->verity_ref)->value('ticket_allocation'));
        $u = $this->player();
        $this->topUp($u, 5000);
        $this->checkout($u, $c, 30)->assertCreated();
        $numbers = \Sprouthub\Verity\Models\Entry::query()->orderBy('id')->pluck('number')->all();
        $this->assertNotSame(range(1, 30), $numbers);
        $this->assertNotSame(range(1, 30), collect($numbers)->sort()->values()->all());
    }

    public function test_a_player_who_asked_not_to_be_named_shows_as_anonymous(): void
    {
        $u = $this->player(['first_name' => 'Liam', 'last_name' => 'Oakes']);
        $u->forceFill(['name_hidden' => true])->save();
        $this->topUp($u, 1000);
        $c = $this->competition('instant', ['max_tickets' => 20, 'max_per_person' => 20], [['£1 Credit', 100, 20, 'site_credit']]);
        $this->checkout($u, $c, 4)->assertCreated();
        Carbon::setTestNow(now()->addMinutes(61)); // not played, but an hour on: shown anyway

        $this->assertSame('Anonymous', $this->getJson('/api/winners/instant')->json('data.0.name'));
        $this->assertSame('Anonymous', $this->getJson('/api/entry-lists/'.$c->slug)->json('data.0.name'));
        $won = collect($this->getJson('/api/competitions/'.$c->slug.'/winning-numbers?show=won')->json('data'));
        $this->assertSame(['Anonymous'], $won->pluck('winnerName')->unique()->values()->all());
        $this->assertStringNotContainsString('Liam', json_encode([$this->getJson('/api/winners/instant')->json(), $this->getJson('/api/entry-lists/'.$c->slug)->json()]));
    }

    public function test_the_contact_form_bot_trap_saves_nothing(): void
    {
        $this->postJson('/api/contact', ['name' => 'Bot', 'email' => 'b@example.com', 'topic' => 'x', 'message' => 'Buy cheap things now', 'website' => 'spam.example'])->assertNoContent();
        $this->assertSame(0, ContactMessage::query()->count());
    }

    public function test_a_webhook_with_a_wrong_signature_is_refused(): void
    {
        $this->app->instance(PaymentGateway::class, new CashflowsGateway('https://gateway-int.cashflows.com', 'C', 'secret'));
        $body = json_encode(['paymentJobReference' => 'JOB-1']);
        $this->call('POST', '/api/webhooks/cashflows', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_HASH' => 'nope'], $body)->assertStatus(401);
        Http::fake();
        $this->call('POST', '/api/webhooks/cashflows', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_HASH' => hash('sha512', 'secret'.$body)], $body)->assertOk();
    }

    public function test_draw_winners_are_emailed(): void
    {
        Notification::fake();
        $u = $this->player();
        $this->topUp($u, 1000);
        $c = $this->competition('draw', ['closes_at' => now()->addMinutes(30)]);
        $this->checkout($u, $c, 4)->assertCreated();
        Carbon::setTestNow(now()->addMinutes(31));
        Verity::close($c->verity_ref);
        Carbon::setTestNow(now()->addMinutes(5));
        Verity::draw($c->verity_ref);
        Notification::assertNotSentTo($u, PrizeWon::class); // held until the result is published
        app(DrawResults::class)->publish($c, null, 'auto');
        Notification::assertSentTo($u, PrizeWon::class);
    }

    public function test_rate_limits_use_the_visitors_address_passed_on_by_astro(): void
    {
        $msg = ['name' => 'A', 'email' => 'a@example.com', 'topic' => 'Help', 'message' => 'Hello there, a question.'];
        $from = fn (string $ip) => $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])->withHeader('X-Forwarded-For', $ip);
        for ($i = 0; $i < 5; $i++) {
            $from('203.0.113.7')->postJson('/api/contact', $msg)->assertNoContent();
        }
        $from('203.0.113.7')->postJson('/api/contact', $msg)->assertStatus(429);
        $from('198.51.100.9')->postJson('/api/contact', $msg)->assertNoContent(); // another visitor isn't affected
        // A made-up address added by the visitor doesn't get round it: the address nginx saw is used.
        $from('1.1.1.1, 203.0.113.7')->postJson('/api/contact', $msg)->assertStatus(429);
        // Only the local proxy is trusted: from anywhere else the header is ignored.
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.50'])->withHeader('X-Forwarded-For', '198.51.100.77')->postJson('/api/contact', $msg)->assertNoContent();
        $this->assertSame(7, ContactMessage::query()->count());
    }

    public function test_the_confirmation_link_takes_a_new_player_back_to_what_they_were_buying(): void
    {
        // Bug: "Enter Now" as a guest → join → confirm from the email (often another tab or browser)
        // landed on a page with no way back to the tickets they'd picked.
        Notification::fake();
        $base = ['firstName' => 'Jo', 'lastName' => 'Bloggs', 'password' => 'correct-horse', 'dateOfBirth' => '1990-05-05'];
        $this->postJson('/api/auth/register', $base + ['email' => 'jo@example.com', 'next' => '/checkout?buy=abc%3A10'])->assertSuccessful();
        $u = User::query()->where('email', 'jo@example.com')->firstOrFail();
        $url = null;
        Notification::assertSentTo($u, VerifyEmail::class, function ($n) use ($u, &$url) {
            $url = $n->toMail($u)->actionUrl;

            return true;
        });
        auth()->forgetGuards();
        $this->get($url)->assertRedirect(rtrim((string) config('app.frontend_url'), '/').'/verify-email?status=verified&next='.rawurlencode('/checkout?buy=abc%3A10'));
        $this->assertTrue($u->refresh()->hasVerifiedEmail());

        // Anything that isn't a path on our own site is ignored.
        foreach (['//evil.example/x', 'https://evil.example', '/api/admin', "/x\nSet-Cookie: a"] as $i => $bad) {
            $this->postJson('/api/auth/register', $base + ['email' => "bad{$i}@example.com", 'next' => $bad])->assertSuccessful();
            $b = User::query()->where('email', "bad{$i}@example.com")->firstOrFail();
            Notification::assertSentTo($b, VerifyEmail::class, function ($n) use ($b, &$url) {
                $url = $n->toMail($b)->actionUrl;

                return true;
            });
            $this->get($url)->assertRedirect(rtrim((string) config('app.frontend_url'), '/').'/verify-email?status=verified');
        }
    }
}
