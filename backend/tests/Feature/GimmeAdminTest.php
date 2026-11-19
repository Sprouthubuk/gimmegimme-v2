<?php

namespace Tests\Feature;

use App\Filament\Pages\GimmeBoxReport;
use App\Filament\Pages\SiteSettings;
use App\Filament\Resources\Competitions\Pages\EditCompetition;
use App\Filament\Resources\Referrals\Pages\ListReferrals;
use App\Models\AdminAction;
use App\Models\Referral;
use App\Models\Setting;
use App\Models\Voucher;
use App\Services\Settings;
use Filament\Facades\Filament;
use Livewire\Livewire;
use Tests\TestCase;

/** The admin side of Gimme Box and Refer a Friend: switches, settings, reports and the review queue. */
class GimmeAdminTest extends TestCase
{
    private function signInAdmin(): void
    {
        $this->actingAs($this->admin());
        Filament::setCurrentPanel(Filament::getPanel('admin'));
    }

    public function test_both_features_start_off_and_are_switched_on_in_settings(): void
    {
        $this->assertFalse(Settings::gimmeBoxOn());
        $this->assertFalse(Settings::referralsOn());
        $this->signInAdmin();
        Livewire::test(SiteSettings::class)->assertFormSet(['feature_gimme_box' => false, 'feature_referrals' => false])
            ->fillForm(['feature_gimme_box' => true, 'gimme_box_bonus_pct' => '15', 'referral_min_purchase_pence' => '10.00'])->call('save')->assertHasNoFormErrors();
        $this->assertTrue(Settings::gimmeBoxOn());
        $this->assertFalse(Settings::referralsOn());
        $this->assertSame('15', Setting::get('gimme_box_bonus_pct'));
        $this->assertSame('1000', Setting::get('referral_min_purchase_pence'));
        $this->assertSame('1', AdminAction::query()->where('action', 'settings.saved')->latest('id')->first()->detail['feature_gimme_box']);

        Livewire::test(SiteSettings::class)->fillForm(['gimme_box_chips' => '500,abc'])->call('save')->assertHasFormErrors(['gimme_box_chips']);
    }

    public function test_a_draw_can_be_left_out_of_boxes_and_its_margin_preview_mentions_the_bonus(): void
    {
        Setting::put('feature_gimme_box', '1');
        \Illuminate\Support\Facades\Storage::fake('public');
        \Illuminate\Support\Facades\Storage::disk('public')->put('competitions/x.webp', 'img');
        $c = $this->competition('draw', ['prize_cost_pence' => 10000, 'image' => 'competitions/x.webp']);
        $this->signInAdmin();
        Livewire::test(EditCompetition::class, ['record' => $c->id])->assertSee('Gimme Box bonus tickets issued so far: 0')->assertSee('box bonus')
            ->fillForm(['gimme_box_enabled' => false, 'gimme_box_weight' => '0.5'])->call('save')->assertHasNoFormErrors();
        $c->refresh();
        $this->assertFalse($c->gimme_box_enabled);
        $this->assertEquals(0.5, (float) $c->gimme_box_weight);
    }

    public function test_the_reports_open(): void
    {
        $this->signInAdmin();
        Livewire::test(GimmeBoxReport::class)->assertOk()->assertSeeHtml('<b>OFF</b>')->assertSee('No paid Gimme Box tickets yet');
        Livewire::test(ListReferrals::class)->assertOk()->assertSee('Refer a Friend is OFF');
    }

    public function test_a_referral_in_review_is_approved_or_rejected_with_a_reason(): void
    {
        Setting::put('feature_referrals', '1');
        $mk = function () {
            return Referral::query()->create(['referrer_id' => $this->player()->id, 'friend_id' => $this->player()->id, 'status' => 'review', 'reasons' => ['many referrals from one IP']]);
        };
        [$a, $b] = [$mk(), $mk()];
        $this->signInAdmin();
        Livewire::test(ListReferrals::class)->assertCanSeeTableRecords([$a, $b])
            ->callTableAction('approve', $a, ['reason' => 'Housemates, checked'])
            ->callTableAction('reject', $b, ['reason' => 'Same person']);
        $this->assertSame('rewarded', $a->refresh()->status);
        $this->assertSame(2, Voucher::query()->where('referral_id', $a->id)->count());
        $this->assertSame('rejected', $b->refresh()->status);
        $this->assertSame(0, Voucher::query()->where('referral_id', $b->id)->count());
        $this->assertSame('Same person', AdminAction::query()->where('action', 'referral.rejected')->value('reason'));
    }
}
