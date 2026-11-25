<?php

namespace Tests\Feature;

use App\Filament\Resources\Competitions\Pages\ListCompetitions;
use App\Models\User;
use Filament\Facades\Filament;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Livewire\Livewire;
use Sprouthub\Verity\Facades\Verity;
use Sprouthub\Verity\Models\Winner;
use Tests\TestCase;

/** The live-stream draw screen's data: open, waiting for the round, drawn (with the winners), never picking anything itself. */
class LiveDrawTest extends TestCase
{
    private function buy(User $u, $c, int $qty)
    {
        return $this->actingAs($u)->postJson('/api/checkout', [
            'lines' => [['competitionId' => $c->id, 'quantity' => $qty]], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid(),
        ]);
    }

    public function test_the_screen_follows_the_draw_and_shows_verity_s_winners_only_once_drawn(): void
    {
        $c = $this->competition('draw', ['slug' => 'echo-flash', 'closes_at' => now()->addMinutes(30), 'max_tickets' => 100, 'max_per_person' => 100,
            'price_pence' => 10, 'end_prize_name' => 'Amazon Echo Dot Max', 'end_prize_count' => 2]);
        $u = $this->player(['first_name' => 'Liam', 'last_name' => "O'Leary"]);
        $this->topUp($u, 1000);
        $this->buy($u, $c, 20)->assertCreated();

        $open = $this->getJson('/api/competitions/echo-flash/live-draw')->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json();
        $this->assertSame(['open', 2, 'Amazon Echo Dot Max', [], 20], [$open['phase'], $open['places'], $open['prizeName'], $open['winners'], $open['competition']['ticketsSold']]);
        $this->assertArrayHasKey('beacon', $open); // null on the tests' local beacon; drand's round and time on the live site

        Carbon::setTestNow(now()->addMinutes(31));
        Verity::close($c->verity_ref);
        $this->assertSame('waiting', $this->getJson('/api/competitions/echo-flash/live-draw')->json('phase'), 'closed: waiting for the random number');
        $this->assertSame([], $this->getJson('/api/competitions/echo-flash/live-draw')->json('winners'));

        Carbon::setTestNow(now()->addMinutes(5));
        Verity::draw($c->verity_ref);
        $drawn = $this->getJson('/api/competitions/echo-flash/live-draw')->assertOk()->json();
        $this->assertSame('drawn', $drawn['phase']);
        $verity = Winner::query()->where('type', 'main')->orderBy('position')->with('entry')->get();
        $this->assertCount(2, $drawn['winners']);
        foreach ($drawn['winners'] as $i => $w) {
            $this->assertSame([$i + 1, (int) $verity[$i]->entry->number, 'Liam O.', 'Amazon Echo Dot Max'], [$w['place'], $w['ticketNumber'], $w['name'], $w['prizeName']]);
        }
        $this->assertStringStartsWith('/verify/', $drawn['verifyUrl']);
        $this->assertNotNull($drawn['drawnAt']);
        // Looking at the screen changes nothing: the same winners every time.
        $this->assertSame($drawn['winners'], $this->getJson('/api/competitions/echo-flash/live-draw')->json('winners'));
    }

    public function test_only_published_competitions_with_a_draw_have_a_screen(): void
    {
        $this->competition('draw', ['slug' => 'not-yet'], [], false);
        $this->getJson('/api/competitions/not-yet/live-draw')->assertNotFound();
        $this->competition('instant', ['slug' => 'instant-only', 'max_tickets' => 40, 'max_per_person' => 40]);
        $this->getJson('/api/competitions/instant-only/live-draw')->assertNotFound();
        $this->getJson('/api/competitions/nope/live-draw')->assertNotFound();
    }

    public function test_the_admin_list_links_each_published_draw_to_its_screen(): void
    {
        $this->actingAs($this->admin());
        Filament::setCurrentPanel('admin');
        $draw = $this->competition('draw', ['slug' => 'echo-flash']);
        $draft = $this->competition('draw', ['slug' => 'draft-draw'], [], false);
        $instant = $this->competition('instant');
        Livewire::test(ListCompetitions::class)
            ->assertTableActionVisible('liveDraw', $draw)->assertTableActionHasUrl('liveDraw', '/live-draw/echo-flash', $draw)
            ->assertTableActionHidden('liveDraw', $draft)->assertTableActionHidden('liveDraw', $instant);
    }
}
