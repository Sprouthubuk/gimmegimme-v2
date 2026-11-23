<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\LedgerEntry;
use App\Models\User;
use App\Services\PrizeBoosts;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Sprouthub\Verity\Models\Competition as VerityCompetition;
use Sprouthub\Verity\Models\Entry;
use Tests\TestCase;

/** Shown prize names (owner, 23 Nov 2026): no "Jackpot" or "Bonus", no repeated names; Verity's record untouched. */
class PrizeDisplayNamesTest extends TestCase
{
    private function buy(User $u, Competition $c, int $qty)
    {
        return $this->actingAs($u)->postJson('/api/checkout', [
            'lines' => [['competitionId' => $c->id, 'quantity' => $qty]], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid(),
        ]);
    }

    /** A small copy of Blankets & Banknotes: two names to change, one that stays, and a boost repeating a name. */
    private function blankets(): Competition
    {
        $c = $this->competition('instant', ['slug' => 'blankets-and-banknotes', 'price_pence' => 10, 'max_tickets' => 40, 'max_per_person' => 40,
            'description' => "Spin for one of 3,982 instant cash prizes up to £750, paid straight to your wallet.\nPlus 4 x £50 end prizes."],
            [['Cosy Cash', 2000, 1, 'site_credit'], ['Blanket Bonus', 25, 2, 'site_credit']]);
        $v = VerityCompetition::query()->where('ref', $c->verity_ref)->firstOrFail();
        $free = 40 - DB::table('verity_instant_tickets')->where('competition_id', $v->id)->count();
        app(PrizeBoosts::class)->apply($c, [[$free, 10000, 'Cosy Cash']], 'Prize boost – 23 Nov 2026');
        (require database_path('migrations/2026_11_23_150000_prize_display_names.php'))->up();

        return $c;
    }

    public function test_the_page_shows_the_new_names_lists_each_rename_and_the_new_count(): void
    {
        $c = $this->blankets();
        $d = $this->getJson('/api/competitions/blankets-and-banknotes')->assertOk()->json();
        $names = collect($d['prizes'])->mapWithKeys(fn ($p) => [$p['valuePence'] => $p['name']])->all();
        $this->assertSame([10000 => 'Cosy Hundred', 2000 => 'Cosy Cash', 25 => 'Blanket Pennies'], $names);
        $this->assertSame([['from' => 'Blanket Bonus', 'to' => 'Blanket Pennies'], ['from' => 'Cosy Cash', 'to' => 'Cosy Hundred']],
            collect($d['renamedPrizes'])->sortBy('from')->values()->all());
        $this->assertStringContainsString('one of 4,055 instant cash prizes up to £750', $d['description']);
        $this->assertStringNotContainsString('3,982', $d['description']);

        // Verity's record keeps the names it committed to.
        $this->assertSame(['Blanket Bonus', 'Cosy Cash', 'Cosy Cash'], DB::table('verity_instant_prizes')->orderBy('name')->pluck('name')->all());
        // Filtering the winning numbers works by the name players see, and only that name.
        $added = 40 - 3;
        $this->assertSame($added, $this->getJson('/api/competitions/blankets-and-banknotes/winning-numbers?prize=Cosy+Hundred')->json('matching'));
        $this->assertSame(1, $this->getJson('/api/competitions/blankets-and-banknotes/winning-numbers?prize=Cosy+Cash')->json('matching'));
        $this->assertSame(0, $this->getJson('/api/competitions/blankets-and-banknotes/winning-numbers?prize=Blanket+Bonus')->json('matching'));
        $this->assertNotContains('Blanket Bonus', collect($this->getJson('/api/competitions/blankets-and-banknotes/winning-numbers')->json('data'))->pluck('prizeName'));

        // Running it again changes nothing.
        (require database_path('migrations/2026_11_23_150000_prize_display_names.php'))->up();
        $this->assertSame(2, DB::table('prize_display_names')->count());
        $this->assertSame(1, substr_count($this->getJson('/api/competitions/blankets-and-banknotes')->json('description'), '4,055'));
    }

    public function test_a_win_is_paid_shown_and_listed_under_the_new_name(): void
    {
        $c = $this->blankets();
        $u = $this->player();
        $this->topUp($u, 1000);
        $res = $this->buy($u, $c, 40)->assertCreated()->json();
        $this->assertSame(2, LedgerEntry::query()->where('user_id', $u->id)->where('reason', 'Instant win · Blanket Pennies')->count());
        $this->assertSame(37, LedgerEntry::query()->where('user_id', $u->id)->where('reason', 'Instant win · Cosy Hundred')->count());
        $this->assertSame(1, LedgerEntry::query()->where('user_id', $u->id)->where('reason', 'Instant win · Cosy Cash')->count());
        $this->assertSame(0, LedgerEntry::query()->where('reason', 'like', '%Bonus%')->where('user_id', $u->id)->where('bucket', 'winnings')->count());

        $play = $this->actingAs($u)->postJson('/api/orders/'.$res['order']['number'].'/play')->assertOk()->json();
        $shown = collect($play['outcome']['tickets'])->pluck('prize.name')->filter()->unique()->sort()->values()->all();
        $this->assertSame(['Blanket Pennies', 'Cosy Cash', 'Cosy Hundred'], $shown);
        $this->assertSame(['Cosy Hundred', 'Cosy Cash', 'Blanket Pennies'], $play['context'][$c->id]['prizeLabels']);

        $feed = collect($this->getJson('/api/winners/instant?limit=50')->json('data'))->pluck('prizeName')->unique()->sort()->values()->all();
        $this->assertSame(['Blanket Pennies', 'Cosy Cash', 'Cosy Hundred'], $feed);
        $v = VerityCompetition::query()->where('ref', $c->verity_ref)->firstOrFail();
        $n = (int) Entry::query()->where('competition_id', $v->id)->value('number');
        $this->assertNotSame('Blanket Bonus', collect($this->getJson('/api/entry-lists/blankets-and-banknotes')->json('data'))->keyBy('ticket')[$n]['prizeName']);
        $this->assertSame(['Blanket Bonus', 'Cosy Cash'], DB::table('verity_winners')->distinct()->orderBy('prize_name')->pluck('prize_name')->all(), "Verity's winners keep its names");
    }

    public function test_a_game_with_no_renames_is_unchanged(): void
    {
        $c = $this->competition('instant', ['slug' => 'other-game', 'max_tickets' => 40, 'max_per_person' => 40, 'description' => 'Spin for one of 3,982 instant cash prizes'], [['Big Bonus', 500, 2, 'site_credit']]);
        (require database_path('migrations/2026_11_23_150000_prize_display_names.php'))->up();
        $d = $this->getJson('/api/competitions/other-game')->assertOk()->json();
        $this->assertSame(['Big Bonus'], collect($d['prizes'])->pluck('name')->all());
        $this->assertSame([], $d['renamedPrizes']);
        $this->assertStringContainsString('3,982', $d['description'], 'only the named games are touched');
    }

    public function test_launch_prize_names_with_the_amount_in_them_are_renamed_too(): void
    {
        $this->competition('instant', ['slug' => 'liams-humbug-heist', 'price_pence' => 10, 'max_tickets' => 40, 'max_per_person' => 40],
            [['£5 Bah Humbug Bonus', 500, 2, 'site_credit'], ['£2 Tiny Tim\'s Tip', 200, 2, 'site_credit']]);
        (require database_path('migrations/2026_11_23_160000_prize_display_names_with_amounts.php'))->up();
        (require database_path('migrations/2026_11_23_160000_prize_display_names_with_amounts.php'))->up();
        $d = $this->getJson('/api/competitions/liams-humbug-heist')->assertOk()->json();
        $this->assertSame(['£5 Bah Humbug Handout', '£2 Tiny Tim\'s Tip'], collect($d['prizes'])->pluck('name')->all());
        $this->assertSame([['from' => '£5 Bah Humbug Bonus', 'to' => '£5 Bah Humbug Handout']], $d['renamedPrizes']);
        $this->assertSame(['£5 Bah Humbug Bonus', '£2 Tiny Tim\'s Tip'], DB::table('verity_instant_prizes')->orderByDesc('value_pence')->pluck('name')->all());
    }
}
