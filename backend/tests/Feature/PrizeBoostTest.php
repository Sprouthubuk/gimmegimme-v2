<?php

namespace Tests\Feature;

use App\Filament\Support\Money;
use App\Models\BoostPrize;
use App\Models\Competition;
use App\Models\LedgerEntry;
use App\Models\PrizeBoost;
use App\Models\User;
use App\Services\Postal;
use App\Services\PrizeBoosts;
use Filament\Auth\MultiFactor\App\AppAuthentication;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Sprouthub\Verity\Facades\Verity;
use Sprouthub\Verity\Models\Competition as VerityCompetition;
use Sprouthub\Verity\Models\Entry;
use Tests\TestCase;

/** Prize boosts (owner, 23 Nov 2026): extra instant prizes beside Verity's table, on unsold numbers only. */
class PrizeBoostTest extends TestCase
{
    private const BATCH = '2026-11-23';

    private function buy(User $u, Competition $c, int $qty)
    {
        return $this->actingAs($u)->postJson('/api/checkout', [
            'lines' => [['competitionId' => $c->id, 'quantity' => $qty]], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid(),
        ]);
    }

    /** 40 tickets at 50p, 3 Verity prizes (£1 each). */
    private function game(array $attrs = []): Competition
    {
        return $this->competition('instant', $attrs + ['slug' => 'smash-my-cash', 'price_pence' => 50, 'max_tickets' => 40, 'max_per_person' => 40],
            [['£1 Credit', 100, 3, 'site_credit']]);
    }

    private function verity(Competition $c): VerityCompetition
    {
        return VerityCompetition::query()->where('ref', $c->verity_ref)->firstOrFail();
    }

    public function test_the_batch_file_adds_up_to_the_owners_figures(): void
    {
        $b = PrizeBoosts::batch(self::BATCH);
        $this->assertSame('Prize boost – 23 Nov 2026', $b['reason']);
        // The owner's final 23 Nov list (09:53, boosting to 40%): £20,450 over 4,476 prizes.
        $want = ['smash-my-cash' => [891, 185000], 'pirates-of-the-prizeibbean' => [805, 190000], 'drop-it-like-its-hot' => [1727, 425000],
            'the-great-cash-escape' => [743, 475000], 'liams-humbug-heist' => [130, 150000], 'demis-grinchmas-gold' => [107, 290000], 'blankets-and-banknotes' => [73, 330000]];
        $this->assertSame([4476, 2045000], [array_sum(array_column($want, 0)), array_sum(array_column($want, 1))]);
        $this->assertSame(array_keys($want), array_keys($b['competitions']));
        foreach ($want as $slug => [$n, $v]) {
            $t = $b['competitions'][$slug];
            $this->assertSame([$n, $v], [array_sum(array_column($t, 0)), array_sum(array_map(fn ($x) => $x[0] * $x[1], $t))], $slug);
        }
    }

    public function test_numbers_are_unsold_not_verity_numbers_reproducible_and_added_once(): void
    {
        $c = $this->game();
        $buyer = $this->player();
        $this->topUp($buyer, 1000);
        $this->buy($buyer, $c, 10)->assertCreated();
        $v = $this->verity($c);
        $issued = Entry::query()->where('competition_id', $v->id)->pluck('number')->map(fn ($n) => (int) $n)->sort()->values()->all();
        $verityNumbers = DB::table('verity_instant_tickets')->where('competition_id', $v->id)->pluck('ticket_number')->map(fn ($n) => (int) $n)->all();
        $before = PrizeBoosts::verityTableHash($v->id);

        $boost = app(PrizeBoosts::class)->apply($c, [[2, 500, 'Big Smash'], [5, 100, 'Mini Smash']], self::BATCH, 'Prize boost – 23 Nov 2026');
        $this->assertInstanceOf(PrizeBoost::class, $boost);
        $numbers = BoostPrize::query()->where('competition_id', $c->id)->orderBy('slot')->pluck('ticket_number')->all();
        $this->assertCount(7, array_unique($numbers));
        foreach ($numbers as $n) {
            $this->assertTrue($n >= 1 && $n <= 40);
            $this->assertNotContains($n, $issued, 'never a sold ticket');
            $this->assertNotContains($n, $verityNumbers, 'never one of Verity\'s numbers');
        }
        $this->assertSame($before, PrizeBoosts::verityTableHash($v->id), 'Verity\'s prizes and numbers unchanged');
        $this->assertSame(['Big Smash', 'Big Smash', 'Mini Smash', 'Mini Smash', 'Mini Smash', 'Mini Smash', 'Mini Smash'],
            BoostPrize::query()->where('competition_id', $c->id)->orderBy('slot')->pluck('name')->all());
        $this->assertSame(['Prize boost – 23 Nov 2026', 7, 1500, count($issued)], [$boost->reason, $boost->prize_count, $boost->value_pence, $boost->issued_count]);
        $this->assertNotNull($boost->added_at);
        $this->assertSame(PrizeBoosts::listHash($issued), $boost->issued_hash);

        // Anyone can re-derive them from the record: same randomness + the numbers left out -> same numbers.
        $candidates = PrizeBoosts::candidates(40, $issued, $verityNumbers);
        $this->assertSame($numbers, PrizeBoosts::derive($boost->beacon_randomness, $v->ref, self::BATCH, $candidates, 7));

        // And from the public record alone (no database access): the same numbers, slot by slot.
        $pub = $this->getJson('/api/competitions/smash-my-cash/prize-boost')->assertOk()->json('data.0');
        $this->assertSame(PrizeBoosts::listHash($pub['excludedNumbers']), $pub['excludedHash']);
        $this->assertSame(array_column($pub['prizes'], 'ticket'), PrizeBoosts::derive($pub['beacon']['randomness'], $v->ref, $pub['batch'],
            PrizeBoosts::candidates($pub['maxTickets'], $pub['excludedNumbers'], []), count($pub['prizes'])));
        $this->assertSame($numbers, PrizeBoosts::rederive($boost, $v->ref));

        // Again: nothing added twice.
        $this->assertSame('already added', app(PrizeBoosts::class)->apply($c, [[2, 500, 'Big Smash']], self::BATCH, 'x'));
        $this->assertSame(7, BoostPrize::query()->count());
    }

    public function test_the_command_dry_run_changes_nothing_and_the_real_run_is_idempotent(): void
    {
        $c = $this->game(['max_tickets' => 5000, 'max_per_person' => 5000]);
        $this->artisan('competitions:boost-prizes', ['--dry-run' => true, '--only' => 'smash-my-cash'])
            ->expectsOutputToContain('DRY RUN')->expectsOutputToContain('Chance of a win per £1 spent: 0.1% now, 35.8% after')->expectsOutputToContain('Adding: 891 worth '.Money::show(185000))->expectsOutputToContain('Ready to add.')->assertSuccessful();
        $this->assertSame(0, BoostPrize::query()->count());
        $this->artisan('competitions:boost-prizes', ['--only' => 'smash-my-cash'])->expectsOutputToContain('ADDED 891 prizes')->assertSuccessful();
        $this->assertSame(891, BoostPrize::query()->where('competition_id', $c->id)->count());
        $this->artisan('competitions:boost-prizes', ['--only' => 'smash-my-cash'])->expectsOutputToContain('SKIP: already added')->assertSuccessful();
        $this->artisan('competitions:boost-prizes', ['--verify' => true, '--only' => 'smash-my-cash'])
            ->expectsOutputToContain('OK   smash-my-cash: numbers re-derive yes · Verity table unchanged yes · sold before the boost 0 · on a Verity number 0')->assertSuccessful();
        $this->assertSame(891, BoostPrize::query()->count());
    }

    public function test_a_ticket_on_an_added_number_is_paid_once_shown_in_the_reveal_and_the_public_list(): void
    {
        $c = $this->game();
        $verityNumbers = DB::table('verity_instant_tickets')->pluck('ticket_number')->map(fn ($x) => (int) $x)->all();
        // Every number that isn't Verity's gets an added prize: of 5 tickets, at least 2 land on one.
        app(PrizeBoosts::class)->apply($c, [[37, 250, 'Smash Hit']], self::BATCH, 'Prize boost – 23 Nov 2026');
        $u = $this->player();
        $this->topUp($u, 1000);
        $res = $this->buy($u, $c, 5)->assertCreated()->json();
        $numbers = Entry::query()->where('competition_id', $this->verity($c)->id)->pluck('number')->map(fn ($n) => (int) $n)->all();
        $won = BoostPrize::query()->where('competition_id', $c->id)->whereIn('ticket_number', $numbers)->get();
        $this->assertSame(count(array_diff($numbers, $verityNumbers)), $won->count());
        $this->assertGreaterThanOrEqual(2, $won->count());
        foreach ($won as $p) {
            $this->assertNotNull($p->won_at);
            $this->assertSame([$u->id, 'user:'.$u->id], [$p->won_user_id, $p->won_owner_ref]);
            $this->assertSame(250, (int) LedgerEntry::query()->where('reference', 'boost-prize:'.$p->id)->where('bucket', 'winnings')->sum('amount_pence'));
        }
        $verityWins = count(array_intersect($numbers, $verityNumbers)) * 100;

        $play = $this->actingAs($u)->postJson('/api/orders/'.$res['order']['number'].'/play')->assertOk()->json();
        $shown = collect($play['outcome']['tickets'])->keyBy('ticketNumber');
        foreach ($won as $p) {
            $this->assertSame(['name' => 'Smash Hit', 'valuePence' => 250, 'type' => 'site_credit'], $shown[$p->ticket_number]['prize']);
        }
        $this->assertSame($won->count() * 250 + $verityWins, $play['outcome']['totalWonPence']);
        // Playing again (and every safety net) pays nothing more.
        $this->actingAs($u)->postJson('/api/orders/'.$res['order']['number'].'/play')->assertOk();
        $this->assertSame($won->count(), LedgerEntry::query()->where('reference', 'like', 'boost-prize:%')->count());
        $this->assertSame($won->count() * 250 + $verityWins, (int) LedgerEntry::query()->where('user_id', $u->id)->where('bucket', 'winnings')->sum('amount_pence'));

        $feed = collect($this->getJson('/api/winners/instant?limit=50')->assertOk()->json('data'));
        $this->assertSame($won->count(), $feed->where('prizeName', 'Smash Hit')->count(), 'added wins in the live winners feed');
        $n = $won->first()->ticket_number;
        $list = $this->getJson('/api/competitions/smash-my-cash/winning-numbers?q='.$n)->assertOk()->json();
        $this->assertSame([true, 'Smash Hit', 250], [$list['data'][0]['won'], $list['data'][0]['prizeName'], $list['data'][0]['valuePence']]);
        $this->assertNotNull($list['data'][0]['addedAt']);
        $all = $this->getJson('/api/competitions/smash-my-cash/winning-numbers')->json();
        $this->assertSame([40, $won->count() + count(array_intersect($numbers, $verityNumbers))], [$all['total'], $all['won']]);
        $this->assertSame(40, $this->getJson('/api/competitions/smash-my-cash/winning-numbers?show=left')->json('matching') + $all['won']);
        $entries = collect($this->getJson('/api/entry-lists/smash-my-cash')->json('data'))->keyBy('ticket');
        $this->assertSame('Smash Hit', $entries[$n]['prizeName']);
    }

    public function test_a_postal_entry_on_an_added_number_is_paid_too(): void
    {
        $c = $this->game();
        $verityNumbers = DB::table('verity_instant_tickets')->pluck('ticket_number')->map(fn ($x) => (int) $x)->all();
        app(PrizeBoosts::class)->apply($c, [[37, 300, 'Postal Smash']], self::BATCH, 'r');
        $u = $this->player();
        foreach (range(1, 4) as $i) {
            app(Postal::class)->log($c, $u->email, now()->subMinutes($i), $this->admin());
        }
        $numbers = Entry::query()->where('competition_id', $this->verity($c)->id)->pluck('number')->map(fn ($n) => (int) $n)->all();
        $boosted = array_diff($numbers, $verityNumbers);
        $this->assertNotEmpty($boosted);
        foreach ($boosted as $n) {
            $p = BoostPrize::query()->where('ticket_number', $n)->firstOrFail();
            $this->assertSame($u->id, $p->won_user_id);
            $this->assertSame(300, (int) LedgerEntry::query()->where('reference', 'boost-prize:'.$p->id)->value('amount_pence'));
        }
    }

    public function test_competitions_that_are_not_live_instant_wins_are_skipped(): void
    {
        $draw = $this->competition('draw');
        $this->assertSame('not a published instant-win competition', app(PrizeBoosts::class)->apply($draw, [[1, 100, 'x']], self::BATCH, 'r'));
        $closed = $this->game(['slug' => 'closed-one']);
        Verity::close($closed->verity_ref, 'Closed early for the prize boost test.');
        $this->assertStringStartsWith('not on sale', (string) app(PrizeBoosts::class)->apply($closed->refresh(), [[1, 100, 'x']], self::BATCH, 'r'));
        $full = $this->game(['slug' => 'too-small']);
        $this->assertSame('only 37 unsold numbers left for 38 prizes', app(PrizeBoosts::class)->apply($full, [[38, 100, 'x']], self::BATCH, 'r'));
        $this->assertSame(0, BoostPrize::query()->count());
    }

    public function test_added_prizes_and_their_record_cannot_be_changed_or_deleted(): void
    {
        $c = $this->game();
        $boost = app(PrizeBoosts::class)->apply($c, [[2, 100, 'Mini Smash']], self::BATCH, 'r');
        $p = BoostPrize::query()->firstOrFail();
        foreach ([fn () => $p->forceFill(['ticket_number' => $p->ticket_number + 1])->save(), fn () => $p->forceFill(['value_pence' => 9999])->save(),
            fn () => $p->delete(), fn () => $boost->forceFill(['reason' => 'x'])->save(), fn () => $boost->delete()] as $try) {
            try {
                $try();
                $this->fail('a change went through');
            } catch (QueryException) {
                $this->assertTrue(true);
            }
        }
    }

    public function test_cards_and_the_detail_page_show_the_new_totals_and_the_boost(): void
    {
        $c = $this->game();
        app(PrizeBoosts::class)->apply($c, [[2, 500, 'Big Smash'], [5, 100, 'Mini Smash']], self::BATCH, 'Prize boost – 23 Nov 2026');
        $card = collect($this->getJson('/api/competitions')->assertOk()->json('data'))->firstWhere('slug', 'smash-my-cash');
        $this->assertSame(10, $card['prizeCount']);
        $this->assertSame(['addedCount' => 7, 'addedPence' => 1500, 'addedAt' => $card['boost']['addedAt']], $card['boost']);
        $this->assertSame('10 instant wins', $card['subtitle']);
        $this->assertSame(500, $card['topPrizePence']);
        $d = $this->getJson('/api/competitions/smash-my-cash')->assertOk()->json();
        $rows = collect($d['prizes']);
        $this->assertSame([2, 0, true], [$rows->firstWhere('name', 'Big Smash')['quantity'], $rows->firstWhere('name', 'Big Smash')['won'], $rows->firstWhere('name', 'Big Smash')['addedAt'] !== null]);
        $this->assertNull($rows->firstWhere('name', '£1 Credit')['addedAt']);
        $this->assertSame(['GG-BOOST-1', 7, 1500], [$d['boostRecord']['algorithm'], $d['boostRecord']['prizeCount'], $d['boostRecord']['valuePence']]);
        $this->assertSame($card['boost'], $d['boost']);
    }

    public function test_the_admin_page_lists_added_prizes_and_saved_runs(): void
    {
        Storage::fake('local');
        $this->game(['max_tickets' => 5000, 'max_per_person' => 5000]);
        $this->artisan('competitions:boost-prizes', ['--only' => 'smash-my-cash'])->assertSuccessful();
        $admin = $this->admin();
        $admin->saveAppAuthenticationSecret(app(AppAuthentication::class)->generateSecret());
        $this->actingAs($admin->refresh(), 'web');
        $this->get('/admin/prize-boosts')->assertOk()->assertSee('Prize Boosts')->assertSee('Mega Smash')->assertSee('ADDED 891 prizes');
    }
}
