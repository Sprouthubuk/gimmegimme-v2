<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\Order;
use App\Models\Referral;
use App\Models\Setting;
use App\Models\User;
use App\Models\Voucher;
use App\Services\Orders;
use App\Services\Referrals;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Refer a Friend: linked at sign-up, rewarded on the friend's first real-money order, with fraud checks. */
class ReferralsTest extends TestCase
{
    private Competition $draw;

    protected function setUp(): void
    {
        parent::setUp();
        Setting::put('feature_referrals', '1');
        Notification::fake();
        // 25p tickets: 20 tickets is the £5 minimum.
        $this->draw = $this->competition('draw', ['max_tickets' => 5000, 'max_per_person' => 5000, 'max_bundle_share_pct' => 10]);
    }

    private function referrer(array $attrs = []): User
    {
        $u = $this->player($attrs);
        app(Referrals::class)->codeFor($u);

        return $u->refresh();
    }

    /** Signs a friend up through the API, as the join page does, from the given IP and device. */
    private function join(User $referrer, string $email, string $ip = '10.0.0.1', ?string $device = null): User
    {
        $this->withServerVariables(['REMOTE_ADDR' => $ip])->postJson('/api/auth/register', [
            'firstName' => 'Friend', 'lastName' => 'Test', 'email' => $email, 'password' => 'a-long-password-1',
            'dateOfBirth' => now()->subYears(25)->toDateString(), 'referralCode' => strtolower($referrer->referral_code),
            'deviceId' => $device ?? 'dev-'.Str::lower(Str::random(10)),
        ])->assertSuccessful();
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->app['auth']->shouldUse('web');
        $u = User::query()->where('email', $email)->firstOrFail();
        $u->forceFill(['email_verified_at' => now()])->save();

        return $u->refresh();
    }

    private function buy(User $u, int $tickets, ?Competition $c = null): Order
    {
        return app(Orders::class)->checkout($u, [['competitionId' => ($c ?? $this->draw)->id, 'quantity' => $tickets]], 'wallet', true, null, (string) Str::uuid())['order'];
    }

    private function buyWithWallet(User $u, int $tickets, ?Competition $c = null): Order
    {
        $this->topUp($u, $tickets * 25);

        return $this->buy($u, $tickets, $c);
    }

    private function ref(User $friend): Referral
    {
        return Referral::query()->where('friend_id', $friend->id)->firstOrFail();
    }

    public function test_a_friend_who_joins_with_the_code_and_spends_five_pounds_gets_both_sides_a_voucher(): void
    {
        $r = $this->referrer();
        $f = $this->join($r, 'pal@example.com');
        $this->assertSame($r->id, $f->referred_by_id);
        $this->assertSame('pending', $this->ref($f)->status);
        $this->assertNotNull($f->signup_ip_hash);
        $this->assertNotSame('10.0.0.1', $f->signup_ip_hash, 'only a hash of the IP is kept');

        $this->buyWithWallet($f, 20);
        $ref = $this->ref($f);
        $this->assertSame('rewarded', $ref->status);
        $this->assertSame(1, Voucher::query()->where('user_id', $r->id)->where('tickets', 10)->where('status', 'available')->count());
        $this->assertSame(1, Voucher::query()->where('user_id', $f->id)->where('status', 'available')->count());

        // A second order never pays again.
        $this->buyWithWallet($f, 40);
        $this->assertSame(2, Voucher::query()->count());
    }

    public function test_nothing_happens_while_the_feature_is_off(): void
    {
        $r = $this->referrer();
        Setting::put('feature_referrals', '0');
        $f = $this->join($r, 'off@example.com');
        $this->assertNull($f->referred_by_id);
        $this->getJson('/api/referrals/'.$r->referral_code)->assertNotFound();
        $this->assertSame(0, Referral::query()->count());
    }

    public function test_a_first_order_under_five_pounds_misses_and_a_later_bigger_one_does_not_count(): void
    {
        $r = $this->referrer();
        $f = $this->join($r, 'small@example.com');
        $this->buyWithWallet($f, 19);
        $this->assertSame('missed', $this->ref($f)->status);
        $this->buyWithWallet($f, 100);
        $this->assertSame('missed', $this->ref($f)->status);
        $this->assertSame(0, Voucher::query()->count());
    }

    public function test_bonus_credit_does_not_count_towards_the_minimum(): void
    {
        $r = $this->referrer();
        $f = $this->join($r, 'bonus@example.com');
        // £8 order: £4 bonus (its 50% most) + £4 deposit. Only £4 is real money.
        $this->topUp($f, 400, 'bonus');
        $this->topUp($f, 400);
        $o = $this->buy($f, 32);
        $this->assertSame('paid', $o->status);
        $this->assertSame('missed', $this->ref($f)->status);
    }

    public function test_a_postal_entry_is_not_a_purchase(): void
    {
        $r = $this->referrer();
        $f = $this->join($r, 'post@example.com');
        app(\App\Services\Postal::class)->log($this->draw, $f->email, now(), $this->admin());
        $this->assertSame('pending', $this->ref($f)->status);
    }

    public function test_the_same_card_blocks_both_rewards(): void
    {
        $r = $this->referrer();
        $first = app(Orders::class)->checkout($r, [['competitionId' => $this->draw->id, 'quantity' => 20]], 'card', false, null, 'rc1')['order'];
        $this->gateway()->settle($first->gateway_ref, 'paid', 'debit', null, 'tok_shared');
        app(Orders::class)->syncWithGateway($first);

        $f = $this->join($r, 'card@example.com');
        $o = app(Orders::class)->checkout($f, [['competitionId' => $this->draw->id, 'quantity' => 20]], 'card', false, null, 'fc1')['order'];
        $this->gateway()->settle($o->gateway_ref, 'paid', 'debit', null, 'tok_shared');
        app(Orders::class)->syncWithGateway($o);

        $ref = $this->ref($f);
        $this->assertSame('blocked', $ref->status);
        $this->assertContains('same card', $ref->reasons);
        $this->assertSame(0, Voucher::query()->count());
        $this->assertNotSame('tok_shared', $o->refresh()->card_hash, 'only a hash of the card token is stored');
    }

    public function test_a_different_card_is_fine(): void
    {
        $r = $this->referrer();
        $first = app(Orders::class)->checkout($r, [['competitionId' => $this->draw->id, 'quantity' => 20]], 'card', false, null, 'rc2')['order'];
        $this->gateway()->settle($first->gateway_ref, 'paid', 'debit', null, 'tok_a');
        app(Orders::class)->syncWithGateway($first);
        $f = $this->join($r, 'card2@example.com');
        $o = app(Orders::class)->checkout($f, [['competitionId' => $this->draw->id, 'quantity' => 20]], 'card', false, null, 'fc2')['order'];
        $this->gateway()->settle($o->gateway_ref, 'paid', 'debit', null, 'tok_b');
        app(Orders::class)->syncWithGateway($o);
        $this->assertSame('rewarded', $this->ref($f)->status);
    }

    public function test_the_same_device_blocks_both_rewards(): void
    {
        $r = $this->referrer(['signup_device_hash' => Referrals::hash('dev-shared')]);
        $f = $this->join($r, 'device@example.com', '10.0.0.2', 'dev-shared');
        $this->buyWithWallet($f, 20);
        $this->assertSame('blocked', $this->ref($f)->status);
        $this->assertContains('same device', $this->ref($f)->reasons);
    }

    public function test_the_same_sign_up_ip_blocks_both_rewards(): void
    {
        $r = $this->referrer(['signup_ip_hash' => Referrals::hash('10.9.9.9')]);
        $f = $this->join($r, 'ip@example.com', '10.9.9.9');
        $this->buyWithWallet($f, 20);
        $this->assertContains('same sign-up IP', $this->ref($f)->reasons);
        $this->assertSame(0, Voucher::query()->count());
    }

    public function test_the_same_address_blocks_both_rewards(): void
    {
        $r = $this->referrer(['postcode' => 'BS1 4DJ', 'address_line1' => '12 High Street']);
        $f = $this->join($r, 'addr@example.com');
        $f->forceFill(['postcode' => 'bs14dj', 'address_line1' => '12, High St reet'])->save();
        $this->buyWithWallet($f, 20);
        $this->assertContains('same address', $this->ref($f)->reasons);
    }

    public function test_the_same_email_with_dots_or_a_plus_blocks_both_rewards(): void
    {
        $r = $this->referrer(['email' => 'jo.smith@gmail.com']);
        $f = $this->join($r, 'josmith+gimme@gmail.com');
        $this->buyWithWallet($f, 20);
        $this->assertContains('same email pattern', $this->ref($f)->reasons);
        $this->assertSame('blocked', $this->ref($f)->status);
    }

    public function test_a_code_cannot_refer_its_own_account_or_a_closed_one(): void
    {
        $closed = $this->referrer(['closed_at' => now()]);
        $this->getJson('/api/referrals/'.$closed->referral_code)->assertNotFound();
        $f = $this->join($closed, 'closed@example.com');
        $this->assertNull($f->referred_by_id);
    }

    public function test_many_friends_from_one_ip_go_to_the_review_queue_and_an_admin_can_approve(): void
    {
        $r = $this->referrer();
        $friends = [];
        foreach ([1, 2, 3] as $i) {
            $friends[$i] = $this->join($r, "same-ip-{$i}@example.com", '10.5.5.5');
            $this->buyWithWallet($friends[$i], 20);
        }
        $this->assertSame('rewarded', $this->ref($friends[1])->status);
        $this->assertSame('rewarded', $this->ref($friends[2])->status);
        $third = $this->ref($friends[3]);
        $this->assertSame('review', $third->status);
        $this->assertContains('many referrals from one IP', $third->reasons);
        $this->assertSame(0, Voucher::query()->where('user_id', $friends[3]->id)->count());

        app(Referrals::class)->approve($third);
        $this->assertSame('rewarded', $third->refresh()->status);
        $this->assertSame(1, Voucher::query()->where('user_id', $friends[3]->id)->count());
    }

    public function test_over_the_monthly_cap_only_the_friend_is_rewarded(): void
    {
        Setting::put('referral_monthly_cap', '1');
        $r = $this->referrer();
        $a = $this->join($r, 'cap-a@example.com', '10.1.1.1');
        $this->buyWithWallet($a, 20);
        $b = $this->join($r, 'cap-b@example.com', '10.1.1.2');
        $this->buyWithWallet($b, 20);
        $this->assertSame('rewarded', $this->ref($a)->status);
        $this->assertSame('capped', $this->ref($b)->status);
        $this->assertSame(1, Voucher::query()->where('user_id', $r->id)->count());
        $this->assertSame(1, Voucher::query()->where('user_id', $b->id)->count());
        $this->assertSame(0, app(Referrals::class)->stats($r)['leftThisMonth']);
    }

    public function test_the_credit_reward_is_bonus_credit_with_an_expiry(): void
    {
        Setting::put('referral_reward_type', 'credit');
        $r = $this->referrer();
        $f = $this->join($r, 'credit@example.com');
        $this->buyWithWallet($f, 20);
        $this->assertSame(200, $this->wallet()->balances($r->refresh())['bonus']);
        $this->assertSame(0, Voucher::query()->count());
    }

    public function test_a_voucher_goes_into_a_live_draw_the_player_picks_and_its_tickets_come_from_verity(): void
    {
        $r = $this->referrer();
        $f = $this->join($r, 'redeem@example.com');
        $this->buyWithWallet($f, 20);
        $v = Voucher::query()->where('user_id', $r->id)->firstOrFail();

        $list = $this->actingAs($r)->getJson("/api/me/vouchers/{$v->id}/draws")->assertOk();
        $this->assertContains($this->draw->id, array_column($list->json('data'), 'id'));
        $raw = json_encode($list->json());
        foreach (['max_tickets', 'maxPerPerson', 'odds'] as $key) { // the draw's ticket counts are public since 22 Nov 2026
            $this->assertStringNotContainsString($key, $raw, "the voucher draw picker must not give away {$key}");
        }

        $this->actingAs($r)->postJson("/api/me/vouchers/{$v->id}/redeem", ['competitionId' => $this->draw->id])->assertCreated();
        $v->refresh();
        $this->assertSame('redeemed', $v->status);
        $order = Order::query()->findOrFail($v->order_id);
        $this->assertSame('paid', $order->status);
        $this->assertSame(0, $order->total_pence);
        $this->assertCount(10, $order->lines()->first()->tickets);

        // Once only.
        $this->actingAs($r)->postJson("/api/me/vouchers/{$v->id}/redeem", ['competitionId' => $this->draw->id])->assertStatus(422);
    }

    public function test_a_voucher_cannot_go_into_an_instant_win_or_someone_elses_hands(): void
    {
        $r = $this->referrer();
        $f = $this->join($r, 'instant@example.com');
        $this->buyWithWallet($f, 20);
        $v = Voucher::query()->where('user_id', $r->id)->firstOrFail();
        $instant = $this->competition('instant');
        $this->actingAs($r)->postJson("/api/me/vouchers/{$v->id}/redeem", ['competitionId' => $instant->id])->assertStatus(422);
        $other = $this->player();
        $this->actingAs($other)->postJson("/api/me/vouchers/{$v->id}/redeem", ['competitionId' => $this->draw->id])->assertNotFound();
        $this->assertSame('available', $v->refresh()->status);
    }

    public function test_an_expired_voucher_cannot_be_used(): void
    {
        $r = $this->referrer();
        $f = $this->join($r, 'expire@example.com');
        $this->buyWithWallet($f, 20);
        $v = Voucher::query()->where('user_id', $r->id)->firstOrFail();
        $this->travel(31)->days();
        $this->assertSame(2, app(Referrals::class)->expireVouchers());
        $this->assertSame('expired', $v->refresh()->status);
        $this->actingAs($r)->postJson("/api/me/vouchers/{$v->id}/redeem", ['competitionId' => $this->draw->id])->assertStatus(422);
    }

    public function test_a_refund_of_the_qualifying_order_claws_back_unused_vouchers(): void
    {
        $r = $this->referrer();
        $f = $this->join($r, 'refund@example.com');
        $o = $this->buyWithWallet($f, 20);
        $o->refresh()->forceFill(['status' => 'refunded'])->save();
        $this->assertSame('clawed_back', $this->ref($f)->status);
        $this->assertSame(2, Voucher::query()->where('status', 'clawed_back')->count());
    }

    public function test_a_refund_after_a_voucher_was_used_goes_to_review_and_leaves_its_tickets(): void
    {
        $r = $this->referrer();
        $f = $this->join($r, 'used@example.com');
        $o = $this->buyWithWallet($f, 20);
        $v = Voucher::query()->where('user_id', $r->id)->firstOrFail();
        app(Referrals::class)->redeem($v, $r, $this->draw);
        $o->refresh()->forceFill(['status' => 'refunded'])->save();
        $this->assertSame('review', $this->ref($f)->status);
        $this->assertSame('redeemed', $v->refresh()->status);
        $this->assertSame('clawed_back', Voucher::query()->where('user_id', $f->id)->value('status'));
    }

    public function test_the_referral_page_shows_the_link_and_stats_but_never_ticket_counts(): void
    {
        $r = $this->referrer();
        $res = $this->actingAs($r)->getJson('/api/me/referrals')->assertOk();
        $this->assertStringEndsWith('/r/'.$r->referral_code, $res->json('link'));
        $this->assertSame(0, $res->json('stats.invited'));
        $this->assertSame(10, $res->json('rewardTickets'));
        $this->assertSame($r->first_name, $this->getJson('/api/referrals/'.strtolower($r->referral_code))->json('firstName'));
    }
}
