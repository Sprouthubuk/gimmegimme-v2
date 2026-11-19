<?php

namespace Tests\Feature;

use App\Models\BundleTier;
use App\Models\Competition;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;
use App\Models\Voucher;
use App\Services\Postal;
use App\Services\PromoCap;
use App\Services\Referrals;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The per-draw cap on promotional free tickets: referral voucher tickets and Gimme Box bonus tickets
 * together never pass `promo_ticket_cap_pct` of a draw. Postal entries are never capped or counted.
 */
class PromoCapTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Setting::put('feature_gimme_box', '1');
        Setting::put('feature_referrals', '1');
    }

    /** A live draw with bundles. 1,000 tickets at the default 5% gives a cap of 50. */
    private function draw(array $attrs = []): Competition
    {
        $c = $this->competition('draw', $attrs + ['max_tickets' => 1000, 'max_per_person' => 1000, 'price_pence' => 10,
            'end_prize_value_pence' => 10000, 'bundles_enabled' => true, 'max_bundle_share_pct' => 50]);
        $ids = collect([[5, 5], [10, 15], [20, 40]])->mapWithKeys(fn ($p, $i) => [BundleTier::query()->where('paid_qty', $p[0])->where('free_qty', $p[1])->value('id') => ['is_featured' => $i === 1]])->all();
        $c->bundleTiers()->sync($ids);

        return $c->refresh();
    }

    private function voucher(User $u, int $tickets = 10): Voucher
    {
        return Voucher::query()->create(['user_id' => $u->id, 'tickets' => $tickets, 'status' => 'available', 'expires_at' => now()->addDays(30)]);
    }

    /** Builds a box over $draws and buys it as a fresh player. */
    private function buyBox(int $budget = 2000): array
    {
        $box = $this->postJson('/api/gimme-box', ['budgetPence' => $budget, 'mode' => 'most'])->assertCreated()->json();
        $this->postJson('/api/gimme-box/'.$box['id'].'/added')->assertOk();
        $u = $this->player();
        $this->topUp($u, 10000);
        $this->actingAs($u)->postJson('/api/checkout', ['lines' => $box['basketLines'], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid()])->assertCreated();

        return [$box, Order::query()->latest('id')->firstOrFail()];
    }

    public function test_the_cap_is_a_share_of_the_draw_and_counts_vouchers_and_box_bonus_together(): void
    {
        $c = $this->draw();
        $this->assertSame(50, PromoCap::cap($c));
        $c->forceFill(['promo_ticket_cap_pct' => 2.5])->save();
        $this->assertSame(25, PromoCap::cap($c->refresh()));
        $c->forceFill(['promo_ticket_cap_pct' => 5])->save();
        $c->refresh();

        $u = $this->player();
        app(Referrals::class)->redeem($this->voucher($u, 10), $u, $c);
        $this->assertSame(10, PromoCap::used($c));
        // Paid tickets and bundle free tickets are not promo tickets.
        $buyer = $this->player();
        $this->topUp($buyer, 5000);
        $this->actingAs($buyer)->postJson('/api/checkout', ['lines' => [['competitionId' => $c->id, 'quantity' => 30]], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => 'paid-1'])->assertCreated();
        $this->assertSame(10, PromoCap::used($c));
        $this->assertSame(40, PromoCap::room($c));
    }

    public function test_the_voucher_picker_hides_a_draw_whose_cap_cant_take_the_voucher_and_redeem_refuses_it(): void
    {
        $capped = $this->draw(['promo_ticket_cap_pct' => 1.5]); // cap 15
        $open = $this->draw();
        $u = $this->player();
        $first = $this->voucher($u, 10);
        $second = $this->voucher($u, 10);
        $ids = fn (Voucher $v) => array_column($this->actingAs($u)->getJson("/api/me/vouchers/{$v->id}/draws")->assertOk()->json('data'), 'id');
        $this->assertContains($capped->id, $ids($first));

        $this->actingAs($u)->postJson("/api/me/vouchers/{$first->id}/redeem", ['competitionId' => $capped->id])->assertCreated();
        // 10 of 15 used: a 10-ticket voucher no longer fits, so the draw is left out.
        $this->assertNotContains($capped->id, $ids($second));
        $this->assertContains($open->id, $ids($second));
        $refused = $this->actingAs($u)->postJson("/api/me/vouchers/{$second->id}/redeem", ['competitionId' => $capped->id])->assertStatus(422);
        $this->assertSame('voucher_draw', $refused->json('code'));
        $this->assertDoesNotMatchRegularExpression('/\d/', $refused->json('message'), 'the refusal never gives a number');
        $this->assertSame('available', $second->refresh()->status);
        $this->assertSame(10, PromoCap::used($capped));
    }

    public function test_gimme_box_bonus_stops_at_the_cap_but_paid_tickets_still_sell(): void
    {
        // Cap 5 on each draw: smaller than a £20 box's 10% bonus.
        $a = $this->draw(['promo_ticket_cap_pct' => 0.5]);
        $b = $this->draw(['promo_ticket_cap_pct' => 0.5]);
        [$box1, $order1] = $this->buyBox();
        foreach ($box1['lines'] as $l) {
            $this->assertLessThanOrEqual(5, $l['bonusQuantity']);
        }
        $this->assertSame('paid', $order1->status);
        $this->assertSame(5, PromoCap::used($a->refresh()));
        $this->assertSame(5, PromoCap::used($b->refresh()));

        // Both draws now full: a new box has no bonus, says so neutrally, and still sells its paid tickets.
        $box2 = $this->postJson('/api/gimme-box', ['budgetPence' => 2000, 'mode' => 'most'])->assertCreated()->json();
        $this->assertSame(0, $box2['bonusTickets']);
        foreach ($box2['lines'] as $l) {
            $this->assertSame(0, $l['bonusQuantity']);
            $this->assertSame(PromoCap::FULL_MESSAGE, $l['notice']);
        }
        $this->postJson('/api/gimme-box/'.$box2['id'].'/added')->assertOk();
        $u = $this->player();
        $this->topUp($u, 10000);
        $res = $this->actingAs($u)->postJson('/api/basket/price', ['lines' => $box2['basketLines']]);
        $this->assertSame(200, $res->status(), $res->getContent());
        $priced = $res->json();
        // The basket can still be bought.
        $this->assertSame([null], array_values(array_unique(array_column($priced['lines'], 'problem'))));
        $this->actingAs($u)->postJson('/api/checkout', ['lines' => $box2['basketLines'], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => 'box2'])->assertCreated();
        $order = Order::query()->latest('id')->firstOrFail();
        $this->assertSame('paid', $order->status);
        $this->assertSame($box2['totalPence'], $order->total_pence);
        $this->assertSame(5, PromoCap::used($a->refresh()));
        $this->assertSame(0, (int) $order->lines()->sum('bonus_quantity'));
    }

    public function test_the_cap_holds_at_checkout_when_two_boxes_were_packed_before_either_was_paid(): void
    {
        $this->draw(['promo_ticket_cap_pct' => 0.5]);
        $this->draw(['promo_ticket_cap_pct' => 0.5]);
        // Both boxes are packed while the cap still has room, then both are paid.
        $one = $this->postJson('/api/gimme-box', ['budgetPence' => 2000, 'mode' => 'most'])->json();
        $two = $this->postJson('/api/gimme-box', ['budgetPence' => 2000, 'mode' => 'most'])->json();
        $this->assertGreaterThan(0, $two['bonusTickets']);
        foreach ([$one, $two] as $i => $box) {
            $u = $this->player();
            $this->topUp($u, 10000);
            if ($i === 1) {
                // The cap filled after this box was packed: the basket drops the bonus and says why, neutrally.
                $priced = $this->actingAs($u)->postJson('/api/basket/price', ['lines' => $box['basketLines']])->json();
                $this->assertSame(0, collect($priced['lines'])->sum('bonusQuantity'));
                $this->assertContains(PromoCap::FULL_MESSAGE, array_column($priced['lines'], 'notice'));
                $this->assertSame([null], array_values(array_unique(array_column($priced['lines'], 'problem'))));
            }
            $this->actingAs($u)->postJson('/api/checkout', ['lines' => $box['basketLines'], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => "race-{$i}"])->assertCreated();
        }
        foreach (Competition::query()->get() as $c) {
            $this->assertLessThanOrEqual(PromoCap::cap($c), PromoCap::used($c), "{$c->title} went over its promo cap");
        }
    }

    public function test_postal_entries_are_not_capped_or_counted(): void
    {
        $c = $this->draw(['promo_ticket_cap_pct' => 1]); // cap 10
        $u = $this->player();
        app(Referrals::class)->redeem($this->voucher($u, 10), $u, $c);
        $this->assertSame(0, PromoCap::room($c));

        $poster = $this->player();
        $entry = app(Postal::class)->log($c, $poster->email, now(), $this->admin());
        $this->assertNotNull($entry->id, 'the postal entry is accepted and gets its ticket');
        $this->assertSame(10, PromoCap::used($c), 'a postal entry is not a promo ticket');
    }

    public function test_no_response_gives_away_the_cap_or_a_ticket_count(): void
    {
        $a = $this->draw(['max_tickets' => 3947, 'max_per_person' => 3947, 'promo_ticket_cap_pct' => 0.5]);
        $this->draw(['max_tickets' => 3989, 'max_per_person' => 3989, 'promo_ticket_cap_pct' => 0.5]);
        $u = $this->player();
        app(Referrals::class)->redeem($this->voucher($u, 10), $u, $a); // 10 of cap 19
        $v = $this->voucher($u, 10);
        $bodies = [
            $this->actingAs($u)->getJson("/api/me/vouchers/{$v->id}/draws")->getContent(),
            $this->actingAs($u)->postJson("/api/me/vouchers/{$v->id}/redeem", ['competitionId' => $a->id])->getContent(),
            $box = $this->postJson('/api/gimme-box', ['budgetPence' => 5000, 'mode' => 'most'])->getContent(),
            $this->postJson('/api/basket/price', ['lines' => json_decode($box, true)['basketLines']])->getContent(),
            $this->getJson('/api/competitions/'.$a->slug)->getContent(),
        ];
        foreach ($bodies as $json) {
            foreach (['promo_ticket_cap', 'promoTicketCap', 'promoCap', 'promoUsed', 'ticketsLeft', 'maxTickets', 'max_tickets', 'room'] as $key) {
                $this->assertStringNotContainsString($key, $json);
            }
            $this->assertDoesNotMatchRegularExpression('/(?<![0-9a-z.])(3947|3989)(?![0-9a-z.])/i', $json);
        }
    }
}
