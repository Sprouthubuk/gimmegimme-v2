<?php

namespace Tests\Feature;

use App\Filament\Resources\Competitions\Pages\HuntBoard;
use App\Models\Competition;
use App\Models\HuntClaim;
use App\Models\HuntTheme;
use App\Models\User;
use App\Notifications\HuntPrizeRevealed;
use App\Notifications\HuntReminder;
use App\Notifications\HuntSymbolFound;
use App\Services\Hunts;
use App\Services\Publishing;
use Filament\Actions\Testing\TestAction;
use Filament\Auth\MultiFactor\App\AppAuthentication;
use Filament\Facades\Filament;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Livewire\Livewire;
use Sprouthub\Verity\Facades\Verity;
use Sprouthub\Verity\Support\HuntMap;
use Tests\TestCase;

/** Mystery Hunts (owner, 26 Nov 2026; docs/mystery-hunt.md). */
class MysteryHuntTest extends TestCase
{
    private function theme(): HuntTheme
    {
        return HuntTheme::query()->create(['name' => 'Christmas Baubles', 'symbol_name' => 'Mystery Bauble', 'symbol_plural' => 'Mystery Baubles',
            'hashtag' => '#BaubleHunt', 'facebook_url' => 'https://www.facebook.com/groups/gimmegimme']);
    }

    /** Every ticket wins something: 6 baubles and 34 × 20p ticket credit, so a sell-out finds every bauble. */
    private function hunt(bool $publish = true): Competition
    {
        $c = $this->competition('instant', ['price_pence' => 20, 'max_tickets' => 40, 'max_per_person' => 40, 'hunt_theme_id' => $this->theme()->id, 'hunt_claim_hours' => 48],
            [['Mystery Bauble', 0, 6, 'hunt_symbol'], ['Ticket Money Back', 20, 34, 'ticket_credit']], false);
        foreach ([['£50 Bauble Cash', 'cash', 5000, 1], ['£10 Bauble Credit', 'ticket_credit', 1000, 2], ['£2 Bauble Credit', 'ticket_credit', 200, 3]] as $i => [$name, $type, $value, $qty]) {
            $c->huntPrizes()->create(['name' => $name, 'type' => $type, 'value_pence' => $value, 'quantity' => $qty, 'sort' => $i]);
        }

        return $publish ? app(Publishing::class)->publish($c, $this->admin()) : $c;
    }

    private function buyAll(Competition $c, User $u): void
    {
        $this->topUp($u, 800);
        $this->actingAs($u)->postJson('/api/checkout', [
            'lines' => [['competitionId' => $c->id, 'quantity' => 40]], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid(),
        ])->assertSuccessful();
    }

    public function test_publishing_seals_the_map_and_a_find_is_a_claim_not_a_payment(): void
    {
        Notification::fake();
        $c = $this->hunt();
        $hunt = Verity::hunt($c->verity_ref);
        $this->assertSame(6, $hunt->size);
        $this->assertSame('Mystery Bauble', $hunt->symbol_name);

        $u = $this->player();
        $this->buyAll($c, $u);
        $claims = HuntClaim::query()->where('competition_id', $c->id)->get();
        $this->assertCount(6, $claims);
        $this->assertTrue($claims->every(fn ($cl) => $cl->status === 'found' && $cl->user_id === $u->id && abs($cl->deadline_at->diffInHours($cl->found_at)) == 48));
        Notification::assertSentToTimes($u, HuntSymbolFound::class, 6);
        // The 34 Ticket Money Back wins went to bonus (expiring); the baubles paid nothing yet.
        $this->assertSame(['deposit' => 0, 'bonus' => 680, 'winnings' => 0], $this->wallet()->balances($u));

        // The public page has the board, but no map.
        $d = $this->getJson("/api/competitions/{$c->slug}")->assertOk()->json('hunt');
        $this->assertSame([6, 6, 0, false], [$d['boardSize'], $d['found'], count($d['picks']), $d['revealed']]);
        $this->assertSame($hunt->commitment, $d['fingerprint']);
        $this->assertNull($d['map']);
        $this->assertStringNotContainsString($hunt->hunt_seed, json_encode($this->getJson("/api/competitions/{$c->slug}")->json()));
    }

    public function test_an_admin_pick_reveals_and_pays_once_and_the_map_is_published_when_the_hunt_ends(): void
    {
        Notification::fake();
        $c = $this->hunt();
        $u = $this->player(['first_name' => 'Liam', 'last_name' => 'Oak']);
        $this->buyAll($c, $u);
        $hunts = app(Hunts::class);
        $map = HuntMap::map(Verity::hunt($c->verity_ref)->hunt_seed, $c->verity_ref, 6);
        $list = $hunts->hiddenList($c);
        [$first, $second, $third] = HuntClaim::query()->where('competition_id', $c->id)->orderBy('ticket_number')->get()->all();

        $won = $hunts->pick($first, 3, 'facebook', $this->admin());
        $behind = $list[$map[2] - 1];
        $this->assertSame([$behind['name'], $behind['value_pence']], [$won['name'], $won['value_pence']]);
        $bucket = $behind['meta']['type'] === 'cash' ? 'winnings' : 'bonus';
        $this->assertSame($behind['value_pence'] + ($bucket === 'bonus' ? 680 : 0), $this->wallet()->balances($u)[$bucket]);
        Notification::assertSentTo($u, HuntPrizeRevealed::class);

        foreach ([fn () => $hunts->pick($first->fresh(), 4, 'email', $this->admin()), fn () => $hunts->pick($second, 3, 'email', $this->admin()),
            fn () => $hunts->pick($second, 7, 'email', $this->admin())] as $i => $f) {
            try {
                $f();
                $this->fail("refusal {$i} accepted");
            } catch (\Throwable) {
                $this->assertTrue(true);
            }
        }
        $this->assertSame(1, HuntClaim::query()->where('status', 'picked')->count());

        // The board shows the pick with a masked name.
        $picks = $this->getJson("/api/competitions/{$c->slug}")->json('hunt.picks');
        $this->assertSame([['number' => 3, 'name' => 'Liam O.', 'prizeName' => $behind['name'], 'valuePence' => $behind['value_pence']]],
            array_map(fn ($p) => array_intersect_key($p, array_flip(['number', 'name', 'prizeName', 'valuePence'])), $picks));

        // A reminder, once; then the window passes and the rest are not won.
        $this->travel(37)->hours();
        $hunts->tick();
        $hunts->tick();
        Notification::assertSentToTimes($u, HuntReminder::class, 5);
        $this->travel(12)->hours();
        $this->assertSame(5, $hunts->tick()['expired']);
        $this->assertFalse(Verity::hunt($c->verity_ref)->revealed_at !== null, 'still on sale: not revealed');
        try {
            $hunts->pick($third->fresh(), 5, 'email', $this->admin());
            $this->fail('an expired find was picked');
        } catch (\DomainException) {
            $this->assertTrue(true);
        }

        // After the close and one more claim window, the map is published.
        $this->travelTo($c->closes_at->copy()->addMinute());
        $this->artisan('verity:process-due');
        $this->travel(49)->hours();
        $this->artisan('hunts:tick')->assertSuccessful();
        $d = $this->getJson("/api/competitions/{$c->slug}")->assertOk()->json('hunt');
        $this->assertTrue($d['revealed']);
        $this->assertCount(6, $d['map']);
        $this->assertSame($behind['name'], collect($d['map'])->firstWhere('number', 3)['prizeName']);
    }

    public function test_a_hunt_must_be_set_up_fully_before_it_publishes(): void
    {
        $c = $this->hunt(false);
        $c->huntPrizes()->first()->update(['quantity' => 2]);
        $this->assertNotEmpty(app(Publishing::class)->problems($c));
        $c->huntPrizes()->first()->update(['quantity' => 1]);
        $this->assertSame([], app(Publishing::class)->problems($c));
        $plain = $this->competition('instant', [], [['Mystery Bauble', 0, 6, 'hunt_symbol']], false);
        $this->assertContains('A hunt symbol prize needs a Mystery Hunt theme.', app(Publishing::class)->problems($plain));
    }

    public function test_the_hunt_board_opens_a_number_for_an_admin(): void
    {
        Notification::fake();
        $c = $this->hunt();
        $this->buyAll($c, $this->player());
        $claim = HuntClaim::query()->where('competition_id', $c->id)->firstOrFail();
        $admin = $this->admin();
        $admin->saveAppAuthenticationSecret(app(AppAuthentication::class)->generateSecret());
        $this->actingAs($admin->refresh(), 'web');
        Filament::setCurrentPanel('admin');
        $this->get(HuntBoard::getUrl(['record' => $c]))->assertOk()->assertSee('Map sealed by Verity');
        Livewire::test(HuntBoard::class, ['record' => $c->getKey()])
            ->callAction(TestAction::make('open')->table($claim), ['number' => 5, 'via' => 'email'])->assertHasNoErrors();
        $this->assertSame([5, 'picked', 'email'], [$claim->refresh()->number, $claim->status, $claim->claimed_via]);
        // Not a hunt: no board.
        $this->get(HuntBoard::getUrl(['record' => $this->competition('instant')]))->assertNotFound();
    }

    public function test_the_bauble_hunt_draft_is_ready_to_publish_with_a_387_pound_fund(): void
    {
        $this->artisan('gimme:bauble-hunt-draft')->assertFailed();
        $this->artisan('gimme:bauble-hunt-draft', ['--closes' => now('Europe/London')->addDays(20)->format('Y-m-d 20:00')])->assertSuccessful();
        $c = Competition::query()->where('slug', 'christmas-bauble-hunt')->firstOrFail();
        $c->forceFill(['image' => '/media/test.webp'])->save();
        $this->assertNull($c->verity_ref, 'a draft');
        $this->assertSame(212, (int) $c->prizes()->sum('quantity'));
        $this->assertSame(12, (int) $c->huntPrizes()->sum('quantity'));
        $fund = $c->prizes->sum(fn ($p) => $p->value_pence * $p->quantity) + $c->huntPrizes->sum(fn ($p) => $p->value_pence * $p->quantity) + $c->end_prize_value_pence;
        $this->assertSame(38700, (int) $fund);
        $this->assertSame([], app(Publishing::class)->problems($c));
        $names = $c->prizes->pluck('name');
        $this->assertSame($names->count(), $names->unique()->count());
        $this->assertFalse($names->merge($c->huntPrizes->pluck('name'))->contains(fn ($n) => preg_match('/jackpot|bonus/i', $n)));
        $this->artisan('gimme:bauble-hunt-draft', ['--closes' => now('Europe/London')->addDays(20)->format('Y-m-d 20:00')])->expectsOutputToContain('skip');
    }
}
