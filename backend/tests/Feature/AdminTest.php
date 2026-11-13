<?php

namespace Tests\Feature;

use App\Filament\Pages\PostalEntries;
use App\Filament\Pages\SiteSettings;
use App\Filament\Resources\Competitions\Pages\CreateCompetition;
use App\Filament\Resources\Competitions\Pages\EditCompetition;
use App\Filament\Resources\Competitions\Pages\ListCompetitions;
use App\Filament\Resources\Orders\Pages\ListOrders;
use App\Filament\Resources\Users\Pages\ListUsers;
use App\Filament\Resources\Withdrawals\Pages\ListWithdrawals;
use App\Models\AdminAction;
use App\Models\Competition;
use App\Models\Order;
use App\Models\Page;
use App\Models\PostalEntry;
use App\Models\Setting;
use App\Models\Withdrawal;
use App\Services\CompetitionState;
use App\Services\PlayCheck;
use App\Services\Postal;
use App\Services\Settings;
use Filament\Auth\MultiFactor\App\AppAuthentication;
use Filament\Facades\Filament;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;
use Tests\TestCase;

class AdminTest extends TestCase
{
    private function signInAdmin()
    {
        $a = $this->admin();
        $this->actingAs($a);
        Filament::setCurrentPanel('admin');

        return $a;
    }

    public function test_only_admins_reach_the_admin(): void
    {
        $this->get('/admin')->assertRedirect('/admin/login');
        $this->actingAs($this->player())->get('/admin')->assertForbidden();
        // An admin without two-step sign-in is sent to set it up first, whatever page they ask for.
        $admin = $this->admin();
        $setup = $this->actingAs($admin)->get('/admin/competitions');
        $setup->assertRedirect();
        $this->assertStringContainsString('multi-factor-authentication', (string) $setup->headers->get('Location'));
        $this->get((string) $setup->headers->get('Location'))->assertOk()->assertSee('Set up two-factor authentication (2FA)', false);
        $admin->saveAppAuthenticationSecret(app(AppAuthentication::class)->generateSecret());
        $this->actingAs($admin->refresh())->get('/admin')->assertOk();
        foreach (['competitions', 'orders', 'users', 'withdrawals', 'prize-claims', 'contact-messages', 'pages', 'promo-codes', 'site-settings', 'postal-entries'] as $p) {
            $this->get('/admin/'.$p)->assertOk();
        }
    }

    public function test_two_step_secrets_are_encrypted_and_never_sent_to_the_site(): void
    {
        $admin = $this->admin();
        $admin->saveAppAuthenticationSecret('JBSWY3DPEHPK3PXP');
        $admin->saveAppAuthenticationRecoveryCodes(['aaaa-bbbb']);
        $raw = DB::table('users')->where('id', $admin->id)->first();
        $this->assertStringNotContainsString('JBSWY3DPEHPK3PXP', (string) $raw->app_authentication_secret);
        $this->assertArrayNotHasKey('app_authentication_secret', $admin->refresh()->toArray());
        $this->actingAs($admin)->getJson('/api/me')->assertJsonMissingPath('app_authentication_secret');

        $this->artisan('gimme:reset-two-step', ['email' => $admin->email])->assertSuccessful();
        $this->assertNull($admin->refresh()->getAppAuthenticationSecret());
    }

    public function test_create_an_instant_win_competition_with_prizes_then_publish_it(): void
    {
        $this->signInAdmin();
        Storage::fake('public');
        Storage::disk('public')->put('competitions/x.webp', 'img');
        Livewire::test(CreateCompetition::class)->fillForm([
            'title' => 'Cash Bang', 'slug' => 'cash-bang', 'type' => 'instant', 'game' => 'balloon_pop', 'skin' => 'christmas',
            'image' => null, 'price_pence' => '0.25', 'max_tickets' => 1000, 'max_per_person' => 200,
            'closes_at' => now('Europe/London')->addDays(10)->format('Y-m-d H:i'),
            'prizes' => [['name' => '£100 Cash', 'value_pence' => '100.00', 'type' => 'cash', 'quantity' => 1], ['name' => '50p Credit', 'value_pence' => '0.50', 'type' => 'site_credit', 'quantity' => 300]],
        ])->call('create')->assertHasFormErrors(['image']);

        $c = Competition::query()->create(['slug' => 'cash-bang', 'title' => 'Cash Bang', 'type' => 'instant', 'game' => 'balloon_pop', 'image' => 'competitions/x.webp',
            'price_pence' => 25, 'max_tickets' => 1000, 'max_per_person' => 200, 'closes_at' => now()->addDays(10)]);
        $c->prizes()->createMany([['name' => '£100 Cash', 'value_pence' => 10000, 'type' => 'cash', 'quantity' => 1], ['name' => '50p Credit', 'value_pence' => 50, 'type' => 'site_credit', 'quantity' => 300]]);

        Livewire::test(EditCompetition::class, ['record' => $c->getKey()])
            ->assertFormSet(['price_pence' => '0.25', 'title' => 'Cash Bang'])
            ->fillForm(['price_pence' => '0.30'])->call('save')->assertHasNoFormErrors();
        $this->assertSame(30, $c->refresh()->price_pence, 'pounds typed, pence stored');

        Livewire::test(ListCompetitions::class)->callTableAction('publish', $c);
        $c->refresh();
        $this->assertStringStartsWith('VTY-', $c->verity_ref);
        $this->assertSame('/storage/competitions/x.webp', $c->imageUrl());
        $this->assertTrue(AdminAction::query()->where('action', 'competition.published')->exists());
        $this->getJson('/api/competitions/cash-bang')->assertOk()->assertJsonPath('prizes.0.name', '£100 Cash')->assertJsonPath('prizes.1.quantity', 300);

        // Terms are fixed once published.
        $this->expectException(\DomainException::class);
        $c->forceFill(['price_pence' => 1])->save();
    }

    public function test_publishing_refuses_an_incomplete_competition(): void
    {
        $this->signInAdmin();
        $c = Competition::query()->create(['slug' => 'x', 'title' => 'X', 'type' => 'instant', 'price_pence' => 25, 'max_tickets' => 10, 'max_per_person' => 20, 'closes_at' => now()->addMinute()]);
        Livewire::test(ListCompetitions::class)->callTableAction('publish', $c)->assertNotified('Not published');
        $this->assertNull($c->refresh()->verity_ref);
    }

    public function test_the_sales_switch_needs_a_reason_and_is_recorded(): void
    {
        $this->signInAdmin();
        Setting::put('sales_open', '0');
        Livewire::test(SiteSettings::class)->callAction('sales', ['reason' => 'Launch day']);
        $this->assertTrue(Setting::bool('sales_open'));
        $this->assertSame('Launch day', AdminAction::query()->where('action', 'sales.opened')->value('reason'));

        Livewire::test(SiteSettings::class)->fillForm(['min_card_pence' => '2.00'])->call('save')->assertHasNoFormErrors();
        $this->assertSame(200, Settings::minCard());
    }

    public function test_rejecting_a_withdrawal_returns_the_winnings(): void
    {
        $this->signInAdmin();
        $u = $this->player(['id_verified_at' => now()]);
        $this->topUp($u, 5000, 'winnings');
        $this->actingAs($u)->postJson('/api/me/withdrawals', ['amountPence' => 3000])->assertCreated();
        $this->signInAdmin();
        $w = Withdrawal::query()->first();
        Livewire::test(ListWithdrawals::class)->callTableAction('reject', $w, ['note' => 'Bank details did not match']);
        $this->assertSame('rejected', $w->refresh()->status);
        $this->assertSame(5000, $this->wallet()->balances($u)['winnings']);
        // Deciding twice changes nothing.
        Livewire::test(ListWithdrawals::class)->assertTableActionHidden('reject', $w);
    }

    public function test_wallet_credit_needs_the_amount_typed_again_and_is_capped(): void
    {
        $this->signInAdmin();
        $u = $this->player();
        Livewire::test(ListUsers::class)->callTableAction('credit', $u, ['bucket' => 'deposit', 'amount' => '5.00', 'reason' => 'Goodwill', 'confirm' => 'ADD 4.00']);
        $this->assertSame(0, $this->wallet()->total($u));
        Livewire::test(ListUsers::class)->callTableAction('credit', $u, ['bucket' => 'deposit', 'amount' => '501.00', 'reason' => 'Goodwill', 'confirm' => 'ADD 501.00']);
        $this->assertSame(0, $this->wallet()->total($u));
        Livewire::test(ListUsers::class)->callTableAction('credit', $u, ['bucket' => 'deposit', 'amount' => '5.00', 'reason' => 'Goodwill', 'confirm' => 'add 5.00']);
        $this->assertSame(500, $this->wallet()->total($u));
    }

    public function test_holds_block_play_and_are_recorded(): void
    {
        $this->signInAdmin();
        $u = $this->player();
        Livewire::test(ListUsers::class)->callTableAction('hold', $u, ['reason' => 'Chargeback']);
        $this->assertSame('on_hold', app(PlayCheck::class)->block($u->refresh()));
        $this->expectException(\DomainException::class);
        $u->delete();
    }

    public function test_orders_needing_attention_can_be_marked_handled(): void
    {
        $this->signInAdmin();
        $u = $this->player();
        $o = Order::query()->create(['number' => 'GG-ATTN0001', 'user_id' => $u->id, 'order_type' => 'tickets', 'status' => 'paid', 'total_pence' => 100, 'card_pence' => 100, 'needs_attention' => true, 'attention_reason' => 'Sold out']);
        Livewire::test(ListOrders::class)->assertCanSeeTableRecords([$o])->callTableAction('resolve', $o, ['reason' => 'Refunded by hand']);
        $this->assertFalse($o->refresh()->needs_attention);
    }

    public function test_postal_entries_have_the_same_chance_and_the_same_checks(): void
    {
        $admin = $this->signInAdmin();
        $u = $this->player(['email' => 'post@example.com']);
        $c = $this->competition('draw', ['max_per_person' => 2]);

        Livewire::test(PostalEntries::class)->fillForm(['competition_id' => $c->id, 'email' => 'post@example.com', 'received_at' => now('Europe/London')->subHour()->format('Y-m-d H:i')])->call('log');
        $this->assertSame('entered', PostalEntry::query()->latest('id')->value('status'));
        $this->assertSame(1, app(CompetitionState::class)->held($c, $u->ownerRef()));

        $postal = app(Postal::class);
        $this->assertSame('No account with a confirmed email address matches.', $postal->log($c, 'nobody@example.com', now(), $admin)->reason);
        $this->assertSame('Received after the closing time.', $postal->log($c, 'post@example.com', $c->closes_at->copy()->addMinute(), $admin)->reason);
        $u->forceFill(['self_excluded_until' => now()->addMonth()])->save();
        $this->assertSame('refused', $postal->log($c, 'post@example.com', now(), $admin)->status);
        $u->forceFill(['self_excluded_until' => null])->save();
        $postal->log($c, 'post@example.com', now(), $admin);
        $this->assertSame('refused', $postal->log($c, 'post@example.com', now(), $admin)->status, 'per-person limit counts postal entries');
    }

    public function test_legal_pages_get_heading_ids_for_their_contents_list(): void
    {
        Page::query()->create(['slug' => 'terms', 'title' => 'Terms & Conditions', 'version' => '1.0', 'html' => '<h2>1. About Us</h2><p>Hi</p><h2>1. About Us</h2>']);
        $r = $this->getJson('/api/pages/terms')->assertOk()->json();
        $this->assertSame([['id' => '1-about-us', 'text' => '1. About Us'], ['id' => '1-about-us-2', 'text' => '1. About Us']], $r['headings']);
    }
}
