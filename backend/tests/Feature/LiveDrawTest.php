<?php

namespace Tests\Feature;

use App\Filament\Resources\Competitions\Pages\ListCompetitions;
use App\Http\Middleware\HoldDrawRecord;
use App\Models\AdminAction;
use App\Models\Competition;
use App\Models\LedgerEntry;
use App\Models\PrizeClaim;
use App\Models\User;
use App\Notifications\PrizeWon;
use App\Services\DrawResults;
use App\Support\PresenterKey;
use Filament\Facades\Filament;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Livewire\Livewire;
use Sprouthub\Verity\Facades\Verity;
use Sprouthub\Verity\Models\Winner;
use Tests\TestCase;

/**
 * The live-stream draw screen, and draw results held until the live reveal (owner, 25 Nov 2026): Verity draws at the
 * close as always, but nobody sees, is told or is paid until an admin publishes the result (from the screen or the
 * admin) or the safety net does, HOLD_MAX_MINUTES later. The screen never picks or changes a winner.
 */
class LiveDrawTest extends TestCase
{
    private function buy(User $u, $c, int $qty)
    {
        return $this->actingAs($u)->postJson('/api/checkout', [
            'lines' => [['competitionId' => $c->id, 'quantity' => $qty]], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid(),
        ]);
    }

    /** A £5 cash draw (paid to winnings) with two places, 20 tickets sold to Liam, closed and drawn by Verity. */
    private function drawn(): array
    {
        $c = $this->competition('draw', ['slug' => 'cash-flash', 'closes_at' => now()->addMinutes(30), 'max_tickets' => 100, 'max_per_person' => 100,
            'price_pence' => 10, 'end_prize_name' => '£5 Cash', 'end_prize_value_pence' => 500, 'end_prize_count' => 2, 'end_prize_type' => 'site_credit']);
        $u = $this->player(['first_name' => 'Liam', 'last_name' => "O'Leary"]);
        $this->topUp($u, 1000);
        $this->buy($u, $c, 20)->assertCreated();
        Carbon::setTestNow(now()->addMinutes(31));
        Verity::close($c->verity_ref);
        Carbon::setTestNow(now()->addMinutes(5));
        Verity::draw($c->verity_ref);

        return [$c->refresh(), $u];
    }

    private function record(Competition $c): int
    {
        return (new HoldDrawRecord)->handle(Request::create('/verity/audit', 'GET', ['competition' => $c->verity_ref]), fn () => response('record'))->getStatusCode();
    }

    public function test_the_screen_counts_down_then_waits_while_open_or_closed(): void
    {
        $c = $this->competition('draw', ['slug' => 'echo-flash', 'closes_at' => now()->addMinutes(30), 'max_tickets' => 100, 'max_per_person' => 100,
            'price_pence' => 10, 'end_prize_name' => 'Amazon Echo Dot Max', 'end_prize_count' => 2]);
        $u = $this->player();
        $this->topUp($u, 1000);
        $this->buy($u, $c, 20)->assertCreated();

        $open = $this->getJson('/api/competitions/echo-flash/live-draw')->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json();
        $this->assertSame(['open', 2, 'Amazon Echo Dot Max', [], 20, false, false],
            [$open['phase'], $open['places'], $open['prizeName'], $open['winners'], $open['competition']['ticketsSold'], $open['published'], $open['presenter']]);
        $this->assertArrayHasKey('beacon', $open); // null on the tests' local beacon; drand's round and time on the live site

        Carbon::setTestNow(now()->addMinutes(31));
        Verity::close($c->verity_ref);
        $w = $this->getJson('/api/competitions/echo-flash/live-draw')->json();
        $this->assertSame(['waiting', []], [$w['phase'], $w['winners']]);
    }

    public function test_a_drawn_result_is_held_from_everyone_but_the_presenter(): void
    {
        Notification::fake();
        [$c, $u] = $this->drawn();
        $this->assertTrue(DrawResults::held($c));

        // The public screen, the winners list, the competition, the account, the record page: no result yet.
        $public = $this->getJson('/api/competitions/cash-flash/live-draw')->json();
        $this->assertSame(['waiting', [], false, null], [$public['phase'], $public['winners'], $public['published'], $public['drawnAt']]);
        $this->assertSame([], $this->getJson('/api/winners/draws')->json('data'));
        $this->assertSame('closed', $this->getJson('/api/competitions/cash-flash')->json('status'));
        $this->assertSame('closed', $this->actingAs($u)->getJson('/api/me/tickets?tab=past')->json('data.0.competition.status'));
        $this->assertSame(423, $this->record($c));
        // Nobody told, nothing paid.
        Notification::assertNotSentTo($u, PrizeWon::class);
        $this->assertSame(0, PrizeClaim::query()->count());
        $this->assertSame(0, LedgerEntry::query()->where('reason', 'like', 'End prize%')->count());

        // The presenter's screen sees Verity's winners, in Verity's order.
        $key = PresenterKey::make($c, $this->admin());
        $p = $this->getJson('/api/competitions/cash-flash/live-draw?key='.$key)->json();
        $verity = Winner::query()->where('type', 'main')->orderBy('position')->with('entry')->get();
        $this->assertSame(['drawn', true, false], [$p['phase'], $p['presenter'], $p['published']]);
        $this->assertCount(2, $p['winners']);
        foreach ($p['winners'] as $i => $w) {
            $this->assertSame([$i + 1, (int) $verity[$i]->entry->number, 'Liam O.', '£5 Cash'], [$w['place'], $w['ticketNumber'], $w['name'], $w['prizeName']]);
        }
        // A changed key, another competition's key or a player's key doesn't.
        // (Changing the last character always changes it: replacing it with a fixed "0" left the key valid
        // whenever the signature already ended in 0, so this failed about one run in sixteen.)
        $changed = substr($key, 0, -1).(str_ends_with($key, '0') ? '1' : '0');
        $this->assertNotSame($key, $changed);
        $this->assertSame([], $this->getJson('/api/competitions/cash-flash/live-draw?key='.$changed)->json('winners'));
        $other = $this->competition('draw', ['slug' => 'other-draw']);
        $this->assertSame([], $this->getJson('/api/competitions/cash-flash/live-draw?key='.PresenterKey::make($other, $this->admin()))->json('winners'));
        $this->assertSame([], $this->getJson('/api/competitions/cash-flash/live-draw?key='.PresenterKey::make($c, $u))->json('winners'));
        Carbon::setTestNow(now()->addDays(PresenterKey::DAYS)->addMinute());
        $this->assertSame([], $this->getJson('/api/competitions/cash-flash/live-draw?key='.$key)->json('winners'), 'the key runs out');
    }

    public function test_publishing_from_the_screen_tells_and_pays_every_winner_once(): void
    {
        Notification::fake();
        [$c, $u] = $this->drawn();
        $admin = $this->admin();
        $key = PresenterKey::make($c, $admin);
        $this->postJson('/api/competitions/cash-flash/live-draw/publish', ['key' => 'nope'])->assertForbidden();
        Notification::assertNotSentTo($u, PrizeWon::class);

        $res = $this->postJson('/api/competitions/cash-flash/live-draw/publish', ['key' => $key])->assertOk()->json();
        $this->assertSame(['drawn', true], [$res['phase'], $res['published']]);
        $this->assertSame(2, PrizeClaim::query()->where('user_id', $u->id)->count());
        $this->assertSame(1000, (int) LedgerEntry::query()->where('user_id', $u->id)->where('reason', 'like', 'End prize%')->sum('amount_pence'));
        Notification::assertSentToTimes($u, PrizeWon::class, 2);
        $this->assertSame('screen', $c->refresh()->result_published_how);
        $this->assertSame(1, AdminAction::query()->where('admin_id', $admin->id)->where('action', 'competition.result_published')->count());

        // Now everyone sees it, and publishing again does nothing more.
        $this->assertCount(2, $this->getJson('/api/competitions/cash-flash/live-draw')->json('winners'));
        $this->assertCount(2, $this->getJson('/api/winners/draws')->json('data'));
        $this->assertSame('drawn', $this->actingAs($u)->getJson('/api/me/tickets?tab=past')->json('data.0.competition.status'));
        $this->assertSame(200, $this->record($c));
        $this->postJson('/api/competitions/cash-flash/live-draw/publish', ['key' => $key])->assertOk();
        $this->assertFalse(app(DrawResults::class)->publish($c, $admin, 'admin'));
        $this->artisan('competitions:publish-draw-results')->assertSuccessful();
        Notification::assertSentToTimes($u, PrizeWon::class, 2);
        $this->assertSame(1000, (int) LedgerEntry::query()->where('user_id', $u->id)->where('reason', 'like', 'End prize%')->sum('amount_pence'));
    }

    public function test_the_safety_net_publishes_a_result_nobody_published(): void
    {
        Notification::fake();
        [$c, $u] = $this->drawn();
        $this->artisan('competitions:publish-draw-results')->assertSuccessful();
        $this->assertTrue(DrawResults::held($c->refresh()), 'not yet');
        Carbon::setTestNow(now()->addMinutes(DrawResults::HOLD_MAX_MINUTES + 1));
        $this->artisan('competitions:publish-draw-results')->assertSuccessful();
        $this->assertSame('auto', $c->refresh()->result_published_how);
        Notification::assertSentToTimes($u, PrizeWon::class, 2);
        $this->artisan('schedule:list')->expectsOutputToContain('competitions:publish-draw-results');
    }

    public function test_a_draw_not_yet_drawn_cannot_be_published(): void
    {
        $c = $this->competition('draw', ['slug' => 'later-draw']);
        $this->postJson('/api/competitions/later-draw/live-draw/publish', ['key' => PresenterKey::make($c, $this->admin())])->assertStatus(409);
        $this->assertNull($c->refresh()->result_published_at);
    }

    public function test_only_published_competitions_with_a_draw_have_a_screen(): void
    {
        $this->competition('draw', ['slug' => 'not-yet'], [], false);
        $this->getJson('/api/competitions/not-yet/live-draw')->assertNotFound();
        $this->competition('instant', ['slug' => 'instant-only', 'max_tickets' => 40, 'max_per_person' => 40]);
        $this->getJson('/api/competitions/instant-only/live-draw')->assertNotFound();
        $this->getJson('/api/competitions/nope/live-draw')->assertNotFound();
    }

    public function test_the_admin_opens_the_presenter_screen_and_can_publish_a_held_result(): void
    {
        Notification::fake();
        [$held, $u] = $this->drawn();
        $admin = $this->admin();
        $this->actingAs($admin);
        Filament::setCurrentPanel('admin');
        $draft = $this->competition('draw', ['slug' => 'draft-draw'], [], false);
        $instant = $this->competition('instant');
        Livewire::test(ListCompetitions::class)
            ->assertTableActionVisible('liveDraw', $held)->assertTableActionHasUrl('liveDraw', '/live-draw/cash-flash?key='.PresenterKey::make($held, $admin), $held)
            ->assertTableActionHidden('liveDraw', $draft)->assertTableActionHidden('liveDraw', $instant)
            ->assertTableActionVisible('publishResult', $held)->assertTableActionHidden('publishResult', $draft)
            ->callTableAction('publishResult', $held)->assertHasNoTableActionErrors();
        $this->assertSame('admin', $held->refresh()->result_published_how);
        Notification::assertSentToTimes($u, PrizeWon::class, 2);
        Livewire::test(ListCompetitions::class)->assertTableActionHidden('publishResult', $held->refresh());
    }
}
