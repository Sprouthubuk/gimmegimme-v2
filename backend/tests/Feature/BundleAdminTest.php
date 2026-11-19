<?php

namespace Tests\Feature;

use App\Filament\Pages\BundleReport;
use App\Filament\Resources\BundleTiers\Pages\ListBundleTiers;
use App\Filament\Resources\Competitions\Pages\EditCompetition;
use App\Models\BundleTier;
use App\Models\Competition;
use App\Services\Bundles;
use Filament\Facades\Filament;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;
use Tests\TestCase;

/** The admin side of bundles: tiers, each competition's choice, the margin preview, the launch drafts. */
class BundleAdminTest extends TestCase
{
    private function signInAdmin(): void
    {
        $this->actingAs($this->admin());
        Filament::setCurrentPanel('admin');
    }

    private function tierId(int $paid, int $free): int
    {
        return BundleTier::query()->where('paid_qty', $paid)->where('free_qty', $free)->value('id');
    }

    public function test_a_competition_chooses_its_bundles_and_best_value_and_the_preview_warns_of_a_loss(): void
    {
        $this->signInAdmin();
        Storage::fake('public');
        Storage::disk('public')->put('competitions/x.webp', 'img');
        $c = Competition::query()->create(['slug' => 'quest', 'title' => 'Quest', 'type' => 'draw', 'image' => 'competitions/x.webp', 'price_pence' => 59,
            'max_tickets' => 3999, 'max_per_person' => 3999, 'closes_at' => now()->addDays(10), 'end_prize_name' => 'Quest']);
        $ids = [(string) $this->tierId(5, 5), (string) $this->tierId(10, 15), (string) $this->tierId(80, 280)];

        Livewire::test(EditCompetition::class, ['record' => $c->getKey()])
            ->fillForm(['bundles_enabled' => true, 'bundle_tier_ids' => $ids, 'featured_bundle_tier_id' => $this->tierId(10, 15), 'max_bundle_share_pct' => 10, 'prize_cost_pence' => '240.00'])
            ->assertSee('Worst-case profit')
            ->call('save')->assertHasNoFormErrors();
        $c->refresh();
        $this->assertTrue($c->bundles_enabled);
        $this->assertSame(24000, $c->prize_cost_pence);
        $this->assertSame([5, 10, 80], $c->bundleTiers->pluck('paid_qty')->all());
        $this->assertSame([10 => true], $c->bundleTiers->filter(fn ($t) => $t->pivot->is_featured)->mapWithKeys(fn ($t) => [$t->paid_qty => true])->all());

        // A prize that costs more than the worst case brings in: the preview says LOSS.
        Livewire::test(EditCompetition::class, ['record' => $c->getKey()])->fillForm(['prize_cost_pence' => '900.00'])->assertSee('LOSS in the worst case');
    }

    public function test_tiers_are_listed_and_the_report_opens(): void
    {
        $this->signInAdmin();
        Livewire::test(ListBundleTiers::class)->assertCanSeeTableRecords(BundleTier::query()->get())->assertSee('Buy 80 Get 280 Free');
        Livewire::test(BundleReport::class)->assertOk()->assertSee('No paid orders yet.');
    }

    public function test_the_launch_draws_are_created_as_drafts_with_their_bundles_once(): void
    {
        $this->artisan('gimme:launch-drafts')->assertSuccessful();
        $this->artisan('gimme:launch-drafts')->assertSuccessful(); // safe to run again
        $all = Competition::query()->with('bundleTiers')->orderBy('max_tickets', 'desc')->get();
        $this->assertCount(5, $all);
        $this->assertTrue($all->every(fn ($c) => $c->verity_ref === null && $c->bundles_enabled && $c->type === 'draw'));
        $quest = $all->firstWhere('slug', 'meta-quest-3s-128gb');
        $this->assertSame([3999, 59, 24000, 28999], [$quest->max_tickets, $quest->price_pence, $quest->prize_cost_pence, $quest->end_prize_value_pence]);
        $this->assertStringNotContainsString('OWNER', (string) $quest->description);
        $this->assertCount(5, $quest->bundleTiers);
        $this->assertSame('Buy 10 Get 15 Free', $quest->bundleTiers->firstWhere('pivot.is_featured', true)->displayLabel());
        $this->assertSame('Shark FlexStyle 4-in-1 Air Styler', $all->firstWhere('slug', 'shark-flexstyle-air-styler')->title); // renamed; address kept
        $airpods = $all->firstWhere('slug', 'apple-airpods-5');
        $this->assertSame('Buy 5 Get 5 Free', $airpods->bundleTiers->firstWhere('pivot.is_featured', true)->displayLabel());
        // Every launch draw still makes money in the worst case its share limit allows.
        foreach ($all as $c) {
            $limit = Bundles::shareLimit($c);
            $tiers = $c->bundleTiers->filter(fn ($t) => $t->total() <= $limit)->map(fn ($t) => ['paid' => $t->paid_qty, 'free' => $t->free_qty])->all();
            $this->assertGreaterThan(0, Bundles::margin($c->price_pence, $c->max_tickets, $c->prize_cost_pence, $tiers)['worstProfitPence'], $c->title);
        }
    }

    public function test_the_report_marks_each_draws_our_pick_bundle(): void
    {
        $c = $this->competition('draw', ['max_tickets' => 1000, 'max_per_person' => 1000, 'price_pence' => 59, 'bundles_enabled' => true]);
        $c->bundleTiers()->sync([$this->tierId(5, 5) => ['is_featured' => false], $this->tierId(10, 15) => ['is_featured' => true]]);
        $u = $this->player();
        $this->topUp($u, 5000);
        $this->actingAs($u)->postJson('/api/checkout', ['lines' => [['competitionId' => $c->id, 'bundleId' => $this->tierId(10, 15)]],
            'payWith' => 'wallet', 'useWallet' => true, 'requestId' => 'r-1'])->assertCreated();
        $this->signInAdmin();
        Livewire::test(BundleReport::class)->assertSee('Buy 10 Get 15 Free (Our Pick)')->assertDontSee('Best Value')->assertDontSee('Most Popular');
    }
}
