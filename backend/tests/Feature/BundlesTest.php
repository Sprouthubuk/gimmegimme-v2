<?php

namespace Tests\Feature;

use App\Models\BundleTier;
use App\Models\Competition;
use App\Models\Order;
use App\Models\PromoCode;
use App\Models\User;
use App\Services\Bundles;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Sprouthub\Verity\Models\Entry;
use Tests\TestCase;

/** "Buy X Get Y Free" bundles on live draws: priced, sized and allocated by the server only. */
class BundlesTest extends TestCase
{
    private function tier(int $paid, int $free): BundleTier
    {
        return BundleTier::query()->where('paid_qty', $paid)->where('free_qty', $free)->firstOrFail();
    }

    /** A live draw with bundles on and the given tiers attached (the first one featured). */
    private function draw(array $attrs = [], array $tiers = [[5, 5], [10, 15], [20, 40]]): Competition
    {
        $c = $this->competition('draw', $attrs + ['max_tickets' => 1000, 'max_per_person' => 1000, 'price_pence' => 59, 'bundles_enabled' => true]);
        foreach ($tiers as $i => [$paid, $free]) {
            $c->bundleTiers()->attach($this->tier($paid, $free)->id, ['is_featured' => $i === 1]);
        }

        return $c->refresh();
    }

    private function buy(User $u, Competition $c, array $line, array $extra = [])
    {
        return $this->actingAs($u)->postJson('/api/checkout', $extra + [
            'lines' => [['competitionId' => $c->id] + $line], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid(),
        ]);
    }

    public function test_the_default_tiers_are_seeded(): void
    {
        $this->assertSame([[5, 5], [10, 15], [20, 40], [40, 100], [80, 280]],
            BundleTier::query()->orderBy('sort_order')->get()->map(fn ($t) => [$t->paid_qty, $t->free_qty])->all());
        $this->assertSame('Buy 20 Get 40 Free', $this->tier(20, 40)->displayLabel());
    }

    public function test_the_competition_page_lists_bundles_priced_by_the_server(): void
    {
        $c = $this->draw();
        $b = $this->getJson('/api/competitions/'.$c->slug)->assertOk()->json('bundles');
        $this->assertSame([10, 25, 60], array_column($b, 'tickets'));
        $this->assertSame(['pricePence' => 20 * 59, 'savePence' => 40 * 59], array_intersect_key($b[2], ['pricePence' => 1, 'savePence' => 1]));
        $this->assertSame([false, true, false], array_column($b, 'ourPick'));
        // Bundles are for live draws: an instant win never lists them.
        $i = $this->competition('instant', ['bundles_enabled' => true]);
        $this->assertSame([], $this->getJson('/api/competitions/'.$i->slug)->json('bundles'));
    }

    public function test_a_bundle_order_is_priced_on_the_server_and_a_tampered_payload_changes_nothing(): void
    {
        $u = $this->player();
        $this->topUp($u, 5000);
        $c = $this->draw();
        $tier = $this->tier(20, 40);
        // The browser can send what it likes; only the competition and bundle id are read.
        $this->buy($u, $c, ['bundleId' => $tier->id, 'quantity' => 1, 'pricePence' => 1, 'paidQuantity' => 1, 'freeQuantity' => 999])->assertCreated();
        $order = Order::query()->latest()->firstOrFail();
        $line = $order->lines()->firstOrFail();
        $this->assertSame([20 * 59, 60, 20, 40, $tier->id], [$order->total_pence, $line->quantity, $line->paid_quantity, $line->free_quantity, $line->bundle_tier_id]);
        $this->assertSame(5000 - 20 * 59, $this->wallet()->balances($u)['deposit']);
        // The site's basket sends quantity 0 on a bundle line: that's fine (it was refused before, 19 Nov).
        $this->buy($u, $c, ['bundleId' => $this->tier(5, 5)->id, 'quantity' => 0])->assertCreated();
        // An unknown bundle id is refused, not priced.
        $this->buy($u, $c, ['bundleId' => 999999])->assertStatus(422)->assertJsonPath('code', 'basket_problem');
    }

    public function test_free_tickets_go_to_verity_as_ordinary_random_entries(): void
    {
        $u = $this->player();
        $this->topUp($u, 5000);
        $c = $this->draw(['max_tickets' => 600, 'max_per_person' => 600]);
        $this->buy($u, $c, ['bundleId' => $this->tier(20, 40)->id])->assertCreated();
        $line = Order::query()->latest()->firstOrFail()->lines()->firstOrFail();
        $this->assertCount(60, $line->tickets);
        $entries = Entry::query()->whereIn('number', $line->tickets)->get();
        $this->assertCount(60, $entries);
        $this->assertSame(['paid'], $entries->pluck('source')->unique()->values()->all()); // no flag that treats free tickets differently
        $this->assertNotSame(range(1, 60), $line->tickets); // random numbers from the whole pool, not 1–60
        // The receipt shows them separately.
        $view = $this->actingAs($u)->getJson('/api/orders/'.$line->order->number)->json('lines.0');
        $this->assertSame([60, 20, 40], [$view['quantity'], $view['paidQuantity'], $view['freeQuantity']]);
    }

    public function test_a_bundle_bigger_than_whats_left_or_the_share_limit_is_never_offered_or_sold(): void
    {
        $u = $this->player();
        $this->topUp($u, 50000);
        // 5% of 500 tickets is 25: Buy 20 Get 40 (60) is over the share limit.
        $c = $this->draw(['max_tickets' => 500, 'max_per_person' => 500, 'max_bundle_share_pct' => 5]);
        $this->assertSame([10, 25], array_column($this->getJson('/api/competitions/'.$c->slug)->json('bundles'), 'tickets'));
        $this->buy($u, $c, ['bundleId' => $this->tier(20, 40)->id])->assertStatus(422)
            ->assertJsonPath('message', $c->title.': This bundle is no longer available. Please choose a smaller one.');

        // Sell all but 20: the 25-ticket bundle disappears, the 10 stays.
        $this->buy($u, $c, ['quantity' => 480])->assertCreated();
        $this->assertSame([10], array_column($this->getJson('/api/competitions/'.$c->slug)->json('bundles'), 'tickets'));
        $this->buy($u, $c, ['bundleId' => $this->tier(10, 15)->id])->assertStatus(422);
        $this->buy($u, $c, ['bundleId' => $this->tier(5, 5)->id])->assertCreated();
    }

    public function test_orders_being_paid_hold_their_tickets_so_the_pool_is_never_oversold(): void
    {
        $c = $this->draw(['max_tickets' => 100, 'max_per_person' => 100, 'max_bundle_share_pct' => 100]);
        $a = $this->player();
        $b = $this->player();
        // A is at the card page with 60 tickets: B can't take a bundle that only fits if A's are ignored.
        $this->buy($a, $c, ['bundleId' => $this->tier(20, 40)->id], ['payWith' => 'card', 'useWallet' => false])->assertCreated();
        $this->topUp($b, 5000);
        $this->buy($b, $c, ['bundleId' => $this->tier(20, 40)->id])->assertStatus(422);
        $this->buy($b, $c, ['bundleId' => $this->tier(10, 15)->id])->assertCreated();
        $this->buy($b, $c, ['quantity' => 16])->assertStatus(422)->assertJsonPath('message', $c->title.': Not that many tickets are left. Please choose fewer.');

        // A never pays: after the hold, the sweep lets the tickets go.
        Carbon::setTestNow(now()->addMinutes(Order::HOLD_MINUTES + 1));
        $this->artisan('orders:sweep')->assertSuccessful();
        $this->assertSame('expired', Order::query()->where('user_id', $a->id)->value('status'));
        $this->buy($b, $c, ['bundleId' => $this->tier(20, 40)->id])->assertCreated();
    }

    public function test_promo_codes_apply_to_single_tickets_not_bundles(): void
    {
        $u = $this->player();
        $c = $this->draw();
        PromoCode::query()->create(['code' => 'HALF', 'percent_off' => 50, 'active' => true]);
        $line = fn (array $l) => ['competitionId' => $c->id] + $l;
        $bundle = $this->actingAs($u)->postJson('/api/basket/price', ['lines' => [$line(['bundleId' => $this->tier(5, 5)->id])], 'promoCode' => 'HALF'])->json();
        $this->assertNull($bundle['promo']);
        $this->assertContains('Promo codes work on single tickets, not bundles.', $bundle['problems']);
        $mixed = $this->actingAs($u)->postJson('/api/basket/price', ['lines' => [$line(['bundleId' => $this->tier(5, 5)->id]), $line(['quantity' => 4])], 'promoCode' => 'HALF'])->json();
        $this->assertSame(intdiv(4 * 59, 2), $mixed['promo']['discountPence']);
        $this->assertSame(5 * 59 + 4 * 59 - intdiv(4 * 59, 2), $mixed['totalPence']);
    }

    public function test_the_basket_offers_the_next_bundle_up(): void
    {
        $u = $this->player();
        $c = $this->draw();
        $p = $this->actingAs($u)->postJson('/api/basket/price', ['lines' => [['competitionId' => $c->id, 'bundleId' => $this->tier(5, 5)->id]]])->json('lines.0');
        $this->assertSame(['bundleId' => $this->tier(10, 15)->id, 'label' => 'Buy 10 Get 15 Free', 'tickets' => 25, 'freeQuantity' => 15, 'extraPence' => 5 * 59], $p['upgrade']);
        $single = $this->actingAs($u)->postJson('/api/basket/price', ['lines' => [['competitionId' => $c->id, 'quantity' => 3]]])->json('lines.0');
        $this->assertSame(2 * 59, $single['upgrade']['extraPence']); // 3 singles → Buy 5 Get 5 for 2 more paid tickets
    }

    public function test_the_worst_case_margin_follows_the_formula(): void
    {
        // Meta Quest: 3,999 tickets at 59p, £240 prize, biggest bundle 80 + 280 = 360.
        $m = Bundles::margin(59, 3999, 24000, [['paid' => 5, 'free' => 5], ['paid' => 80, 'free' => 280]]);
        $orders = intdiv(3999, 360);                        // 11 whole bundles
        $rest = 3999 - $orders * 360;                       // 39 sold as singles
        $worst = $orders * 80 * 59 + $rest * 59;
        $fees = (int) round($worst * 0.016) + 15 * ($orders + 1);
        $this->assertSame(3999 * 59, $m['singlesRevenuePence']);
        $this->assertSame($worst, $m['worstRevenuePence']);
        $this->assertSame($fees, $m['worstFeesPence']);
        $this->assertSame($worst - $fees - 24000, $m['worstProfitPence']);
        $perOrder = 80 * 59 - ((int) round(80 * 59 * 0.016) + 15);
        $this->assertSame((int) ceil(24000 / $perOrder) * 360, $m['breakEvenTickets']);
    }

    public function test_competitions_show_players_the_maximum_sold_and_left_tickets(): void
    {
        // Owner, 22 Nov 2026: players see the maximum, how many are sold and how many are left (was % sold only).
        $u = $this->player();
        $this->topUp($u, 5000);
        $c = $this->draw(['max_tickets' => 3947, 'max_per_person' => 3947]);
        $i = $this->competition('instant', ['max_tickets' => 3989, 'max_per_person' => 3989], [['£5 Credit', 500, 10, 'site_credit']]);
        $this->buy($u, $c, ['quantity' => 7])->assertCreated();
        $this->app['auth']->forgetGuards();

        $this->getJson('/api/competitions/'.$c->slug)->assertOk()
            ->assertJsonPath('maxTickets', 3947)->assertJsonPath('ticketsSold', 7)->assertJsonPath('ticketsLeft', 3940);
        $this->getJson('/api/competitions/'.$i->slug)->assertOk()
            ->assertJsonPath('maxTickets', 3989)->assertJsonPath('ticketsSold', 0)->assertJsonPath('ticketsLeft', 3989);
        $list = collect($this->getJson('/api/competitions')->assertOk()->json('data'))->keyBy('slug');
        $this->assertSame([3947, 7, 3940], [$list[$c->slug]['maxTickets'], $list[$c->slug]['ticketsSold'], $list[$c->slug]['ticketsLeft']]);
        // A player's own limit is never shown: there isn't one (owner, 18 Nov 2026).
        $this->assertStringNotContainsString('maxPerPerson', $this->getJson('/api/competitions/'.$c->slug)->getContent());
    }

    public function test_sold_percent_rounds_down_and_is_100_only_when_sold_out(): void
    {
        $u = $this->player();
        $this->topUp($u, 100000);
        $c = $this->draw(['max_tickets' => 1000, 'max_per_person' => 1000, 'price_pence' => 10]);
        $this->buy($u, $c, ['quantity' => 998])->assertCreated();
        $this->assertSame(99, $this->getJson('/api/competitions/'.$c->slug)->json('soldPercent'));
        $this->buy($u, $c, ['quantity' => 2])->assertCreated();
        $this->assertSame(100, $this->getJson('/api/competitions/'.$c->slug)->json('soldPercent'));
    }

    public function test_a_bundle_and_single_tickets_for_the_same_draw_in_one_order_are_all_issued(): void
    {
        $u = $this->player();
        $this->topUp($u, 5000);
        $c = $this->draw();
        $this->actingAs($u)->postJson('/api/checkout', ['lines' => [['competitionId' => $c->id, 'quantity' => 0, 'bundleId' => $this->tier(5, 5)->id], ['competitionId' => $c->id, 'quantity' => 3]],
            'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid()])->assertCreated();
        $lines = Order::query()->latest()->firstOrFail()->lines()->get();
        $this->assertSame([10, 3], $lines->map(fn ($l) => count($l->tickets))->all());
        $this->assertCount(13, array_unique([...$lines[0]->tickets, ...$lines[1]->tickets]), 'thirteen different tickets');
    }
}
