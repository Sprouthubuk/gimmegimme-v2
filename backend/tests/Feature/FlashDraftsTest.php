<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Services\Bundles;
use App\Services\Publishing;
use App\Services\Settings;
use Tests\TestCase;

/** The three flash draws for Sunday 29 Nov 2026 (owner, 25 Nov): drafts with buttons, bundles, limits and cash alternatives. */
class FlashDraftsTest extends TestCase
{
    public function test_the_flash_draws_are_created_once_as_drafts_closing_sunday_at_8pm(): void
    {
        $this->artisan('gimme:flash-drafts')->assertSuccessful();
        $this->artisan('gimme:flash-drafts')->assertSuccessful(); // safe to run again
        $all = Competition::query()->with('bundleTiers')->get()->keyBy('slug');
        $this->assertCount(3, $all);
        $this->assertTrue($all->every(fn ($c) => $c->verity_ref === null && $c->type === 'draw' && $c->bundles_enabled));
        $this->assertTrue($all->every(fn ($c) => $c->closes_at->timezone('Europe/London')->format('D j M Y H:i') === 'Sun 29 Nov 2026 20:00'));

        $cash = $all['200-tax-free-cash'];
        $gta = $all['gta-6-ultimate-edition'];
        $echo = $all['amazon-echo-dot-max'];
        $this->assertSame([12000, 5, 1200, 20000, null, 'site_credit'], [$cash->max_tickets, $cash->price_pence, $cash->max_per_person, $cash->end_prize_value_pence, $cash->cash_alternative_pence, $cash->end_prize_type]);
        $this->assertSame([13500, 2, 1350, 8999, 7000, 'physical'], [$gta->max_tickets, $gta->price_pence, $gta->max_per_person, $gta->end_prize_value_pence, $gta->cash_alternative_pence, $gta->end_prize_type]);
        $this->assertSame([15000, 1, 1500, 4999, 4000, 'physical'], [$echo->max_tickets, $echo->price_pence, $echo->max_per_person, $echo->end_prize_value_pence, $echo->cash_alternative_pence, $echo->end_prize_type]);
        $this->assertStringContainsString('£70 cash instead', $gta->description);
        $this->assertStringContainsString('£40 cash instead', $echo->description);

        $minCard = Settings::minCard();
        foreach ($all as $c) {
            // Ticket buttons: £1 · £2.50 · £5 · £10, the smallest a card can pay for.
            $this->assertSame([100, 250, 500, 1000], array_map(fn ($n) => $n * $c->price_pence, $c->presetList()), $c->title);
            $this->assertGreaterThanOrEqual($minCard, $c->presetList()[0] * $c->price_pence);
            // Nobody can hold more than 10% of the tickets.
            $this->assertSame(intdiv($c->max_tickets, 10), $c->max_per_person);
            // Two bundles, both offered (within the 10% share limit and the per-person limit), the bigger one Our Pick.
            $this->assertCount(2, $c->bundleTiers);
            $limit = Bundles::shareLimit($c);
            $this->assertTrue($c->bundleTiers->every(fn ($t) => $t->total() <= $limit && $t->total() <= $c->max_per_person), $c->title);
            $this->assertSame($c->bundleTiers->sortBy('paid_qty')->last()->id, $c->bundleTiers->firstWhere('pivot.is_featured', true)->id);
            // Still makes money if every ticket went out in the most generous bundle.
            $tiers = $c->bundleTiers->map(fn ($t) => ['paid' => $t->paid_qty, 'free' => $t->free_qty])->all();
            $this->assertGreaterThan(0, Bundles::margin($c->price_pence, $c->max_tickets, $c->prize_cost_pence, $tiers)['worstProfitPence'], $c->title);
        }
        $this->assertSame(['Buy 200 Get 25 Free', 'Buy 500 Get 60 Free', 'Buy 1000 Get 120 Free'],
            array_map(fn ($c) => $c->bundleTiers->firstWhere('pivot.is_featured', true)->displayLabel(), [$cash, $gta, $echo]));
    }

    public function test_a_flash_draw_publishes_and_sells_its_bundle_from_the_wallet(): void
    {
        $this->artisan('gimme:flash-drafts')->assertSuccessful();
        $c = Competition::query()->where('slug', 'amazon-echo-dot-max')->firstOrFail();
        $c->update(['image' => '/media/test.webp']);
        app(Publishing::class)->publish($c, $this->admin());
        $u = $this->player();
        $this->topUp($u, 2000);
        $tier = $c->bundleTiers()->wherePivot('is_featured', true)->firstOrFail();
        $this->actingAs($u)->postJson('/api/checkout', ['lines' => [['competitionId' => $c->id, 'bundleId' => $tier->id]],
            'payWith' => 'wallet', 'useWallet' => true, 'requestId' => 'flash-1'])->assertCreated();
        $d = $this->getJson('/api/competitions/amazon-echo-dot-max')->assertOk()->json();
        $this->assertSame([1120, 4000, [100, 250, 500, 1000], 1500], [$d['ticketsSold'], $d['cashAlternativePence'], $d['presets'], $d['maxPerPerson']]);
    }
}
