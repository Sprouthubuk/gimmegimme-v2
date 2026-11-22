<?php

namespace Tests\Feature;

use App\Exceptions\RefusedException;
use App\Models\BundleTier;
use App\Models\Competition;
use App\Models\GimmeBox;
use App\Models\Order;
use App\Models\Setting;
use App\Services\CompetitionState;
use App\Services\GimmeBoxes;
use App\Services\GimmeBoxPacker;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Tests\TestCase;

/** The Gimme Box: packed and priced on the server, never over budget, holds its tickets for a while. */
class GimmeBoxTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Setting::put('feature_gimme_box', '1');
    }

    private function tierIds(array $pairs): array
    {
        return collect($pairs)->mapWithKeys(fn ($p, $i) => [BundleTier::query()->where('paid_qty', $p[0])->where('free_qty', $p[1])->value('id') => ['is_featured' => $i === 1]])->all();
    }

    /** A live draw with bundles (5+5, 10+15, 20+40) and a prize value. */
    private function draw(int $price, int $value, array $attrs = []): Competition
    {
        $c = $this->competition('draw', $attrs + ['max_tickets' => 2000, 'max_per_person' => 2000, 'price_pence' => $price,
            'end_prize_value_pence' => $value, 'bundles_enabled' => true, 'max_bundle_share_pct' => 10]);
        $c->bundleTiers()->sync($this->tierIds([[5, 5], [10, 15], [20, 40]]));

        return $c->refresh();
    }

    private function packer(): GimmeBoxPacker
    {
        return app(GimmeBoxPacker::class);
    }

    public function test_the_packer_never_goes_over_budget_and_leaves_less_than_one_ticket_unused(): void
    {
        $draws = [$this->draw(59, 28999), $this->draw(79, 29999), $this->draw(99, 11900)];
        $cheapest = 59;
        foreach (['surprise', 'big', 'most'] as $mode) {
            foreach ([500, 1000, 2000, 3700, 5000, 10000] as $budget) {
                foreach (range(1, 8) as $seed) {
                    $box = $this->packer()->pack($budget, $mode, null, $seed);
                    $this->assertLessThanOrEqual($budget, $box['totalPence'], "{$mode} £{$budget} seed {$seed}");
                    // Within one single ticket of the cheapest draw in the box.
                    $this->assertLessThan(min(array_map(fn ($l) => $l['competition']->price_pence, $box['lines'])), $box['unusedPence'], "{$mode} £{$budget} seed {$seed}: too much left unused");
                    $this->assertSame($box['totalPence'], array_sum(array_column($box['lines'], 'linePence')));
                    $this->assertGreaterThanOrEqual(1, count($box['lines']));
                    $this->assertLessThanOrEqual($budget < 1000 ? 2 : 4, count($box['lines']));
                    foreach ($box['lines'] as $l) {
                        // The competition page's prices: bundle paid × price, singles × price. Bonus is 10% rounded down.
                        $this->assertSame($l['paid'] * $l['competition']->price_pence, $l['linePence']);
                        $this->assertSame(intdiv(($l['paid'] + $l['free']) * 10, 100), $l['bonus']);
                    }
                }
            }
        }
        $this->assertCount(3, $draws);
    }

    public function test_draws_over_95_percent_sold_closing_soon_switched_off_or_instant_are_never_used(): void
    {
        $u = $this->player();
        $this->topUp($u, 100000);
        $full = $this->draw(10, 10000, ['max_tickets' => 100, 'max_per_person' => 100, 'max_bundle_share_pct' => 100]);
        $this->actingAs($u)->postJson('/api/checkout', ['lines' => [['competitionId' => $full->id, 'quantity' => 96]], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => 'r-full'])->assertCreated();
        $soon = $this->draw(10, 10000, ['closes_at' => now()->addMinutes(50)]);
        $off = $this->draw(10, 10000, ['gimme_box_enabled' => false]);
        $instant = $this->competition('instant'); // instant-win games start out of the box
        $this->assertFalse($instant->gimme_box_enabled);
        $ok = [$this->draw(59, 1000)->id, $this->draw(79, 1000)->id];
        $used = collect($this->packer()->eligible('surprise'))->map(fn ($d) => $d['c']->id)->all();
        $this->assertEqualsCanonicalizing($ok, $used);
        $this->assertNotContains($full->id, $used);
        $this->assertNotContains($soon->id, $used);
        $this->assertNotContains($off->id, $used);
        $this->assertNotContains($instant->id, $used);
    }

    public function test_bundles_follow_the_share_limit_and_bonus_never_passes_what_is_left(): void
    {
        // 300 tickets, 10% share = 30: Buy 20 Get 40 (60) is never used.
        $c = $this->draw(10, 10000, ['max_tickets' => 300, 'max_per_person' => 300]);
        foreach (range(1, 10) as $seed) {
            foreach ($this->packer()->pack(10000, 'most', null, $seed)['lines'] as $l) {
                $this->assertNotSame(20, $l['bundle']['paid'] ?? null);
                $this->assertLessThanOrEqual(300, $l['paid'] + $l['free'] + $l['bonus']);
            }
        }
        $this->assertSame($c->id, $this->packer()->pack(1000, 'surprise', null, 1)['lines'][0]['competition']->id);
    }

    public function test_each_mode_shifts_the_spread_the_expected_way(): void
    {
        $cheapBig = $this->draw(10, 1000);    // cheap tickets, small prize
        $dearSmall = $this->draw(99, 50000);  // dear tickets, big prize
        $other = $this->draw(50, 5000);
        $count = function (string $mode) use ($cheapBig, $dearSmall) {
            $n = ['cheap' => 0, 'dear' => 0];
            foreach (range(1, 150) as $seed) {
                foreach ($this->packer()->pack(500, $mode, null, $seed)['lines'] as $l) {
                    $n['cheap'] += $l['competition']->id === $cheapBig->id ? 1 : 0;
                    $n['dear'] += $l['competition']->id === $dearSmall->id ? 1 : 0;
                }
            }

            return $n;
        };
        $surprise = $count('surprise');
        $big = $count('big');
        $most = $count('most');
        $this->assertGreaterThan($surprise['dear'], $big['dear'], 'Big prizes favours the biggest prize');
        $this->assertGreaterThan($surprise['cheap'], $most['cheap'], 'Most tickets favours the cheapest tickets');
        $this->assertNotNull($other);
    }

    public function test_a_box_holds_its_tickets_until_shaken_again_or_timed_out(): void
    {
        $a = $this->draw(10, 10000);
        $b = $this->draw(10, 10000);
        $state = app(CompetitionState::class);
        $box = app(GimmeBoxes::class)->build(1000, 'surprise', null, null, 7);
        $held = fn () => $state->boxHolds($a) + $state->boxHolds($b);
        $this->assertSame($box->tickets, $held());
        $second = app(GimmeBoxes::class)->build(1000, 'surprise', null, $box->id, 8);
        $this->assertSame('released', $box->refresh()->status);
        $this->assertSame($second->tickets, $held(), 'only the new box holds tickets');
        Carbon::setTestNow(now()->addMinutes(11));
        $this->assertSame(0, $held(), 'the hold ends after 10 minutes');
        app(GimmeBoxes::class)->expire();
        $this->assertSame('expired', $second->refresh()->status);
    }

    public function test_build_add_and_pay_issues_the_bonus_tickets_through_verity(): void
    {
        $this->draw(10, 10000);
        $this->draw(20, 20000);
        $box = $this->postJson('/api/gimme-box', ['budgetPence' => 1000, 'mode' => 'most', 'totalPence' => 1, 'lines' => []])->assertCreated()->json();
        $this->assertLessThanOrEqual(1000, $box['totalPence']);
        $this->assertSame($box['budgetPence'] - $box['totalPence'], $box['unusedPence']);
        $this->assertGreaterThan(0, $box['bonusTickets']);
        $this->postJson('/api/gimme-box/'.$box['id'].'/added')->assertOk();

        $u = $this->player();
        $this->topUp($u, 5000);
        $priced = $this->actingAs($u)->postJson('/api/basket/price', ['lines' => $box['basketLines']]);
        $this->assertSame(200, $priced->status(), $priced->getContent());
        $priced = $priced->json();
        $this->assertSame($box['totalPence'], $priced['totalPence'], json_encode([$box['lines'], $box['basketLines'], $priced['lines']]));
        $this->assertSame($box['tickets'], $priced['ticketCount']);
        $this->actingAs($u)->postJson('/api/checkout', ['lines' => $box['basketLines'], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid()])->assertCreated();
        $order = Order::query()->latest()->firstOrFail();
        $this->assertSame('paid', $order->status);
        $this->assertSame($box['tickets'], (int) $order->lines()->sum('quantity'));
        $this->assertSame($box['bonusTickets'], (int) $order->lines()->sum('bonus_quantity'));
        $this->assertSame($box['tickets'], collect($order->lines()->get())->sum(fn ($l) => count($l->tickets)), 'every ticket, bonus included, issued by Verity');
        $this->assertSame('paid', GimmeBox::query()->find($box['id'])->status);
        // A paid box gives no bonus a second time.
        $again = $this->actingAs($u)->postJson('/api/basket/price', ['lines' => $box['basketLines']])->json();
        $this->assertSame(0, collect($again['lines'])->sum('bonusQuantity'));
    }

    public function test_a_basket_that_no_longer_matches_the_box_gets_no_bonus(): void
    {
        $c = $this->draw(10, 10000);
        $this->draw(20, 20000);
        $box = $this->postJson('/api/gimme-box', ['budgetPence' => 500, 'mode' => 'surprise'])->json();
        $line = collect($box['basketLines'])->first();
        $tampered = [['competitionId' => $line['competitionId'], 'quantity' => 1, 'boxId' => $box['id']]]; // fewer singles / no bundle
        $p = $this->postJson('/api/basket/price', ['lines' => $tampered])->json();
        $this->assertSame(0, collect($p['lines'])->sum('bonusQuantity'));
        $fake = $this->postJson('/api/basket/price', ['lines' => [['competitionId' => $c->id, 'quantity' => 50, 'boxId' => str_repeat('a', 32)]]])->json();
        $this->assertSame(0, collect($fake['lines'])->sum('bonusQuantity'));
    }

    public function test_budget_limits_mode_and_switch(): void
    {
        $this->draw(10, 10000);
        $this->draw(20, 10000);
        $this->postJson('/api/gimme-box', ['budgetPence' => 400, 'mode' => 'surprise'])->assertStatus(422)->assertJsonPath('code', 'gimme_box_budget');
        $this->postJson('/api/gimme-box', ['budgetPence' => 10100, 'mode' => 'surprise'])->assertStatus(422);
        $this->postJson('/api/gimme-box', ['budgetPence' => 550, 'mode' => 'surprise'])->assertStatus(422); // whole pounds
        $this->postJson('/api/gimme-box', ['budgetPence' => 500, 'mode' => 'cheap'])->assertStatus(422);
        $this->getJson('/api/site')->assertJsonPath('gimmeBox.available', true)->assertJsonPath('gimmeBox.chipsPence', [500, 1000, 2000, 5000]);

        Setting::put('feature_gimme_box', '0');
        Cache::flush();
        $this->postJson('/api/gimme-box', ['budgetPence' => 500, 'mode' => 'surprise'])->assertNotFound();
        $this->getJson('/api/site')->assertJsonPath('gimmeBox', null)->assertJsonPath('referrals', null);
    }

    public function test_the_section_is_unavailable_with_fewer_than_two_draws_and_a_budget_below_any_ticket_packs_nothing(): void
    {
        $this->draw(10, 10000);
        $this->getJson('/api/site')->assertJsonPath('gimmeBox.available', false);
        Setting::put('gimme_box_min_pence', '100');
        $this->draw(2000, 10000, ['max_tickets' => 10, 'max_per_person' => 10]);
        Cache::flush();
        $box = $this->packer()->pack(100, 'big', null, 3);
        $this->assertLessThanOrEqual(100, $box['totalPence']);
    }

    public function test_no_gimme_box_response_gives_away_a_ticket_count(): void
    {
        $this->draw(10, 10000, ['max_tickets' => 3947, 'max_per_person' => 3947]);
        $this->draw(20, 10000, ['max_tickets' => 3989, 'max_per_person' => 3989]);
        $body = $this->postJson('/api/gimme-box', ['budgetPence' => 2000, 'mode' => 'surprise'])->assertCreated()->getContent();
        $box = json_decode($body, true);
        $added = $this->postJson('/api/gimme-box/'.$box['id'].'/added')->getContent();
        $site = $this->getJson('/api/site')->getContent();
        foreach ([$body, $added, $site] as $json) {
            foreach (['ticketsLeft', 'maxTickets', 'max_tickets', 'tickets_sold', 'tickets_remaining', 'room', 'sold"'] as $key) {
                $this->assertStringNotContainsString($key, $json);
            }
            // As a number of its own (ids and box codes are letters and digits, so a bare substring could match by chance).
            $this->assertDoesNotMatchRegularExpression('/(?<![0-9a-z])(3947|3989)(?![0-9a-z])/i', $json);
        }
    }

    public function test_two_players_racing_for_a_nearly_sold_out_draw_never_oversell(): void
    {
        $tight = $this->draw(10, 10000, ['max_tickets' => 40, 'max_per_person' => 40, 'max_bundle_share_pct' => 100]);
        $this->draw(10, 10000);
        $boxes = app(GimmeBoxes::class);
        $held = 0;
        foreach (range(1, 6) as $seed) {
            try {
                $b = $boxes->build(1000, 'surprise', null, null, $seed);
                $held += ($b->lineFor($tight->id)['paid'] ?? 0) + ($b->lineFor($tight->id)['free'] ?? 0) + ($b->lineFor($tight->id)['bonus'] ?? 0);
            } catch (RefusedException) {
            }
        }
        $this->assertLessThanOrEqual(40, $held, 'boxes never hold more than the draw has');
    }

    /** An instant-win game switched into the box: 10p a ticket, every ticket wins 50p credit. */
    private function instant(array $attrs = [], array $prizes = [['50p Credit', 50, 2000, 'site_credit']]): Competition
    {
        return $this->competition('instant', $attrs + ['max_tickets' => 2000, 'max_per_person' => 2000, 'price_pence' => 10, 'gimme_box_enabled' => true], $prizes)->refresh();
    }

    public function test_instant_wins_go_in_a_box_only_when_switched_on_with_paid_tickets_only_and_always_with_a_live_draw(): void
    {
        $this->assertTrue($this->competition('draw')->gimme_box_enabled, 'a new draw starts in the box');
        $off = $this->competition('instant');
        $on = $this->instant();
        $on2 = $this->instant(['price_pence' => 25]);
        $this->draw(59, 28999);
        $used = collect($this->packer()->eligible('surprise'))->map(fn ($d) => $d['c']->id)->all();
        $this->assertContains($on->id, $used);
        $this->assertNotContains($off->id, $used);

        $sawInstant = false;
        foreach (['surprise', 'big', 'most'] as $mode) {
            foreach ([500, 1000, 2000, 5000, 10000] as $budget) {
                foreach (range(1, 8) as $seed) {
                    $box = $this->packer()->pack($budget, $mode, null, $seed);
                    $this->assertLessThanOrEqual($budget, $box['totalPence']);
                    $this->assertSame($box['totalPence'], array_sum(array_column($box['lines'], 'linePence')));
                    $types = array_map(fn ($l) => $l['competition']->type, $box['lines']);
                    $this->assertContains('draw', $types, "{$mode} £{$budget} seed {$seed}: every box has a live draw");
                    foreach ($box['lines'] as $l) {
                        $this->assertSame($l['paid'] * $l['competition']->price_pence, $l['linePence']);
                        if ($l['competition']->type === 'instant') {
                            $sawInstant = true;
                            $this->assertSame([null, 0, 0], [$l['bundle'], $l['free'], $l['bonus']], 'instant-win lines: paid singles only');
                        }
                    }
                }
            }
        }
        $this->assertTrue($sawInstant);
        $this->assertCount(2, [$on, $on2]);
    }

    public function test_a_box_needs_a_live_draw_and_big_prizes_counts_an_instant_wins_whole_prize_list(): void
    {
        $this->instant();
        $this->instant();
        $this->assertFalse(app(GimmeBoxPacker::class)->available(), 'two instant wins and no draw: no box');
        $this->assertSame([], $this->packer()->pack(2000, 'surprise', null, 1)['lines']);
        $this->getJson('/api/site')->assertJsonPath('gimmeBox.available', false);

        $draw = $this->draw(10, 10000); // £100 prize
        $big = $this->instant([], [['£50 Credit', 5000, 20, 'site_credit'], ['50p Credit', 50, 100, 'site_credit']]); // £1,050 list
        $this->assertTrue(app(GimmeBoxPacker::class)->available());
        $w = collect($this->packer()->eligible('big'))->mapWithKeys(fn ($d) => [$d['c']->id => $d['weight']]);
        $this->assertGreaterThan($w[$draw->id] * 10, $w[$big->id]);
    }

    public function test_a_box_with_an_instant_win_is_paid_for_and_played_like_any_basket(): void
    {
        $draw = $this->draw(10, 10000);
        $iw = $this->instant();
        $box = $this->postJson('/api/gimme-box', ['budgetPence' => 1000, 'mode' => 'surprise'])->assertCreated()->json();
        $types = collect($box['lines'])->pluck('type', 'competitionId');
        $this->assertSame(['draw', 'instant'], [$types[$draw->id], $types[$iw->id]]);
        $iwLine = collect($box['lines'])->firstWhere('competitionId', $iw->id);
        $this->assertSame([0, null], [$iwLine['bonusQuantity'], $iwLine['bundleId']]);
        $this->postJson('/api/gimme-box/'.$box['id'].'/added')->assertOk();

        $u = $this->player();
        $this->topUp($u, 5000);
        $priced = $this->actingAs($u)->postJson('/api/basket/price', ['lines' => $box['basketLines']])->assertOk()->json();
        $this->assertSame($box['totalPence'], $priced['totalPence']);
        $this->assertSame($box['tickets'], $priced['ticketCount']);
        $res = $this->actingAs($u)->postJson('/api/checkout', ['lines' => $box['basketLines'], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid()])
            ->assertCreated()->assertJsonPath('next', 'play')->json();
        $order = Order::query()->latest()->firstOrFail();
        $this->assertSame('paid', $order->status);
        $line = $order->lines()->where('competition_id', $iw->id)->firstOrFail();
        $this->assertSame([$iwLine['paidQuantity'], 0], [(int) $line->quantity, (int) $line->bonus_quantity]);
        $this->assertCount($iwLine['paidQuantity'], $line->tickets, 'instant-win tickets issued by Verity');

        $play = $this->postJson('/api/orders/'.$res['order']['number'].'/play')->assertOk()->json();
        $this->assertSame($iwLine['paidQuantity'] * 50, $play['outcome']['totalWonPence'], 'every instant ticket wins its 50p');
        $this->assertTrue($play['context'][$iw->id]['isInstantWin']);
    }

    public function test_a_box_record_can_never_give_bonus_tickets_on_an_instant_win(): void
    {
        $this->draw(10, 10000);
        $iw = $this->instant();
        $box = $this->postJson('/api/gimme-box', ['budgetPence' => 1000, 'mode' => 'surprise'])->assertCreated()->json();
        // Even if a stored box said otherwise, pricing gives an instant-win line no bonus.
        $model = GimmeBox::query()->findOrFail($box['id']);
        $model->lines = array_map(fn ($l) => $l['competition_id'] === $iw->id ? ['bonus' => 5] + $l : $l, $model->lines);
        $model->save();
        $priced = $this->postJson('/api/basket/price', ['lines' => $box['basketLines']])->assertOk()->json();
        $this->assertSame(0, collect($priced['lines'])->firstWhere('competitionId', $iw->id)['bonusQuantity']);
    }

    public function test_existing_instant_wins_start_out_of_the_box(): void
    {
        $iw = $this->competition('instant', ['gimme_box_enabled' => true]);
        $draw = $this->competition('draw');
        (include database_path('migrations/2026_11_22_220000_gimme_box_instant_wins.php'))->up();
        $this->assertFalse($iw->refresh()->gimme_box_enabled);
        $this->assertTrue($draw->refresh()->gimme_box_enabled);
    }
}
