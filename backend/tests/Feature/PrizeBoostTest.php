<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\LedgerEntry;
use App\Models\User;
use App\Services\Postal;
use App\Services\PrizeBoosts;
use Filament\Auth\MultiFactor\App\AppAuthentication;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Sprouthub\Verity\Facades\Verity;
use Sprouthub\Verity\Models\AuditEvent;
use Sprouthub\Verity\Models\Competition as VerityCompetition;
use Sprouthub\Verity\Models\Entry;
use Sprouthub\Verity\Models\InstantAddition;
use Sprouthub\Verity\Support\DrawReverify;
use Tests\TestCase;

/** Prize boosts (owner, 23 Nov 2026): extra instant prizes added by Verity itself (spec §17), never touching what's there. */
class PrizeBoostTest extends TestCase
{
    private const REASON = 'Prize boost – 23 Nov 2026';

    private function buy(User $u, Competition $c, int $qty)
    {
        return $this->actingAs($u)->postJson('/api/checkout', [
            'lines' => [['competitionId' => $c->id, 'quantity' => $qty]], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid(),
        ]);
    }

    /** 40 tickets at 50p, 3 original prizes (£1 each). */
    private function game(array $attrs = []): Competition
    {
        return $this->competition('instant', $attrs + ['slug' => 'smash-my-cash', 'price_pence' => 50, 'max_tickets' => 40, 'max_per_person' => 40],
            [['£1 Credit', 100, 3, 'site_credit']]);
    }

    private function verity(Competition $c): VerityCompetition
    {
        return VerityCompetition::query()->where('ref', $c->verity_ref)->firstOrFail();
    }

    /** Every number nobody holds that isn't already a winner. */
    private function free(Competition $c): int
    {
        $v = $this->verity($c);

        return 40 - Entry::query()->where('competition_id', $v->id)->pluck('number')->merge(DB::table('verity_instant_tickets')->where('competition_id', $v->id)->pluck('ticket_number'))->unique()->count();
    }

    public function test_the_batch_file_adds_up_to_the_owners_figures(): void
    {
        $b = PrizeBoosts::batch('2026-11-23');
        $this->assertSame(self::REASON, $b['reason']);
        // The owner's final 23 Nov list (09:53, boosting to 40%): £20,450 over 4,476 prizes.
        $want = ['smash-my-cash' => [891, 185000], 'pirates-of-the-prizeibbean' => [805, 190000], 'drop-it-like-its-hot' => [1727, 425000],
            'the-great-cash-escape' => [743, 475000], 'liams-humbug-heist' => [130, 150000], 'demis-grinchmas-gold' => [107, 290000], 'blankets-and-banknotes' => [73, 330000]];
        $this->assertSame(array_keys($want), array_keys($b['competitions']));
        foreach ($want as $slug => [$n, $v]) {
            $t = $b['competitions'][$slug];
            $this->assertSame([$n, $v], [array_sum(array_column($t, 0)), array_sum(array_map(fn ($x) => $x[0] * $x[1], $t))], $slug);
        }
    }

    public function test_verity_adds_them_only_on_unheld_numbers_leaves_the_rest_alone_and_only_once(): void
    {
        Storage::fake('local');
        $c = $this->game(['max_tickets' => 5000, 'max_per_person' => 5000]);
        $u = $this->player();
        $this->topUp($u, 1000);
        $this->buy($u, $c, 10)->assertCreated();
        $v = $this->verity($c);
        $sold = Entry::query()->where('competition_id', $v->id)->pluck('number')->map(fn ($n) => (int) $n)->all();
        $original = DB::table('verity_instant_tickets')->where('competition_id', $v->id)->orderBy('id')->get()->map(fn ($r) => (array) $r)->all();
        $hash = DrawReverify::storedTableHash($v);

        $this->artisan('competitions:boost-prizes', ['--dry-run' => true, '--only' => 'smash-my-cash'])->expectsOutputToContain('DRY RUN')
            ->expectsOutputToContain('Adding: 891 worth £1,850.00')->expectsOutputToContain('Ready to add.')->assertSuccessful();
        $this->assertSame(0, InstantAddition::query()->count(), 'a dry run changes nothing');

        $this->artisan('competitions:boost-prizes', ['--only' => 'smash-my-cash'])->expectsOutputToContain('ADDED by Verity: addition 1')->assertSuccessful();
        $a = InstantAddition::query()->firstOrFail();
        $this->assertSame(['sealed', self::REASON], [$a->status, $a->reason]);
        $added = DB::table('verity_instant_tickets')->where('addition_id', $a->id)->pluck('ticket_number')->map(fn ($n) => (int) $n)->all();
        $this->assertCount(891, array_unique($added));
        $this->assertSame([], array_intersect($added, $sold), 'never a sold ticket');
        $this->assertSame([], array_intersect($added, array_column($original, 'ticket_number')), 'never an original winning number');
        $this->assertSame($original, DB::table('verity_instant_tickets')->where('competition_id', $v->id)->whereNull('addition_id')->orderBy('id')->get()->map(fn ($r) => (array) $r)->all(),
            'every original winning number and its prize link is exactly as it was');
        $this->assertSame($hash, DrawReverify::storedTableHash($v->fresh()), 'Verity\'s original table is unchanged');
        $this->assertTrue(AuditEvent::query()->where('type', 'instant.prizes_added')->exists());
        $this->assertSame('site_credit', DB::table('verity_instant_prizes')->where('addition_id', $a->id)->value('meta') ? json_decode(DB::table('verity_instant_prizes')->where('addition_id', $a->id)->value('meta'), true)['type'] : null);

        $this->artisan('competitions:boost-prizes', ['--only' => 'smash-my-cash'])->expectsOutputToContain('SKIP: already added')->assertSuccessful();
        $this->assertSame(1, InstantAddition::query()->count());
        $this->artisan('competitions:boost-prizes', ['--verify' => true, '--only' => 'smash-my-cash'])
            ->expectsOutputToContain('OK   smash-my-cash: added numbers re-derive yes · original prizes and numbers unchanged yes · sold before being added 0')->assertSuccessful();
    }

    public function test_a_ticket_on_an_added_number_is_won_through_verity_paid_once_and_shown_everywhere(): void
    {
        $c = $this->game();
        $verityNumbers = DB::table('verity_instant_tickets')->pluck('ticket_number')->map(fn ($x) => (int) $x)->all();
        app(PrizeBoosts::class)->apply($c, [[$this->free($c), 250, 'Smash Hit']], self::REASON);
        $u = $this->player();
        $this->topUp($u, 1000);
        $res = $this->buy($u, $c, 5)->assertCreated()->json();
        $numbers = Entry::query()->where('competition_id', $this->verity($c)->id)->pluck('number')->map(fn ($n) => (int) $n)->all();
        $boosted = array_values(array_diff($numbers, $verityNumbers));
        $this->assertGreaterThanOrEqual(2, count($boosted));
        $wins = DB::table('verity_winners')->where('type', 'instant')->where('prize_name', 'Smash Hit')->get();
        $this->assertCount(count($boosted), $wins, 'won through Verity, as Verity instant wins');
        $this->assertSame(count($boosted) * 250, (int) LedgerEntry::query()->where('user_id', $u->id)->where('reason', 'Instant win · Smash Hit')->sum('amount_pence'));

        $play = $this->actingAs($u)->postJson('/api/orders/'.$res['order']['number'].'/play')->assertOk()->json();
        $shown = collect($play['outcome']['tickets'])->keyBy('ticketNumber');
        foreach ($boosted as $n) {
            $this->assertSame(['name' => 'Smash Hit', 'valuePence' => 250, 'type' => 'site_credit'], $shown[$n]['prize']);
        }
        $this->assertContains('Smash Hit', $play['context'][$c->id]['prizeLabels']);
        $this->actingAs($u)->postJson('/api/orders/'.$res['order']['number'].'/play')->assertOk();
        $this->assertSame(count($boosted), LedgerEntry::query()->where('reason', 'Instant win · Smash Hit')->count(), 'paid once');

        $row = $this->getJson('/api/competitions/smash-my-cash/winning-numbers?q='.$boosted[0])->assertOk()->json('data.0');
        $this->assertSame([true, 'Smash Hit', 250], [$row['won'], $row['prizeName'], $row['valuePence']]);
        $this->assertNotNull($row['addedAt']);
        $this->assertSame(40, $this->getJson('/api/competitions/smash-my-cash/winning-numbers')->json('total'), '3 original + 37 added: every number is now a winner');
        $this->assertSame('Smash Hit', collect($this->getJson('/api/entry-lists/smash-my-cash')->json('data'))->keyBy('ticket')[$boosted[0]]['prizeName']);
        $this->assertSame(count($boosted), collect($this->getJson('/api/winners/instant?limit=50')->json('data'))->where('prizeName', 'Smash Hit')->count());
    }

    public function test_a_postal_entry_on_an_added_number_wins_too(): void
    {
        $c = $this->game();
        $verityNumbers = DB::table('verity_instant_tickets')->pluck('ticket_number')->map(fn ($x) => (int) $x)->all();
        app(PrizeBoosts::class)->apply($c, [[$this->free($c), 300, 'Postal Smash']], self::REASON);
        $u = $this->player();
        foreach (range(1, 4) as $i) {
            app(Postal::class)->log($c, $u->email, now()->subMinutes($i), $this->admin());
        }
        $numbers = Entry::query()->where('competition_id', $this->verity($c)->id)->pluck('number')->map(fn ($n) => (int) $n)->all();
        $boosted = array_diff($numbers, $verityNumbers);
        $this->assertNotEmpty($boosted);
        $this->assertSame(count($boosted) * 300, (int) LedgerEntry::query()->where('user_id', $u->id)->where('reason', 'Instant win · Postal Smash')->sum('amount_pence'));
    }

    public function test_cards_and_the_page_show_the_new_totals_and_how_verity_added_them(): void
    {
        $c = $this->game();
        app(PrizeBoosts::class)->apply($c, [[2, 500, 'Big Smash'], [5, 100, 'Mini Smash']], self::REASON);
        $card = collect($this->getJson('/api/competitions')->assertOk()->json('data'))->firstWhere('slug', 'smash-my-cash');
        $this->assertSame([10, '10 instant wins', 500], [$card['prizeCount'], $card['subtitle'], $card['topPrizePence']]);
        $this->assertSame([7, 1500], [$card['boost']['addedCount'], $card['boost']['addedPence']]);
        $d = $this->getJson('/api/competitions/smash-my-cash')->assertOk()->json();
        $rows = collect($d['prizes']);
        $this->assertSame([2, 0], [$rows->firstWhere('name', 'Big Smash')['quantity'], $rows->firstWhere('name', 'Big Smash')['won']]);
        $this->assertNotNull($rows->firstWhere('name', 'Big Smash')['addedAt']);
        $this->assertNull($rows->firstWhere('name', '£1 Credit')['addedAt']);
        $this->assertSame([1, self::REASON, 7, 1500], [$d['boostRecord'][0]['addition'], $d['boostRecord'][0]['reason'], $d['boostRecord'][0]['prizeCount'], $d['boostRecord'][0]['valuePence']]);
        $this->assertSame([], collect($this->getJson('/api/competitions')->json('data'))->where('slug', '!=', 'smash-my-cash')->whereNotNull('boost')->all());
    }

    public function test_competitions_not_on_sale_are_skipped(): void
    {
        $draw = $this->competition('draw');
        $this->assertSame('not a published instant-win competition', app(PrizeBoosts::class)->apply($draw, [[1, 100, 'x']], self::REASON));
        $closed = $this->game(['slug' => 'closed-one']);
        Verity::close($closed->verity_ref, 'Closed early for the prize boost test.');
        $this->assertStringStartsWith('not on sale', (string) app(PrizeBoosts::class)->apply($closed->refresh(), [[1, 100, 'x']], self::REASON));
        $this->assertSame(0, InstantAddition::query()->count());
    }

    public function test_the_admin_page_lists_added_prizes_and_saved_runs(): void
    {
        Storage::fake('local');
        $this->game(['max_tickets' => 5000, 'max_per_person' => 5000]);
        $this->artisan('competitions:boost-prizes', ['--only' => 'smash-my-cash'])->assertSuccessful();
        $admin = $this->admin();
        $admin->saveAppAuthenticationSecret(app(AppAuthentication::class)->generateSecret());
        $this->actingAs($admin->refresh(), 'web');
        $this->get('/admin/prize-boosts')->assertOk()->assertSee('Prize Boosts')->assertSee('Mega Smash')->assertSee('ADDED by Verity: addition 1');
    }

    public function test_the_old_boost_tables_are_removed_only_when_empty(): void
    {
        // What the failed #56 deploy left on the live site: a prize_boosts table, and no record of its migration.
        $create = function () {
            Schema::create('prize_boosts', function ($t) {
                $t->id();
                $t->string('batch', 40);
            });
            DB::unprepared(DB::getDriverName() === 'sqlite'
                ? "CREATE TRIGGER prize_boosts_no_delete BEFORE DELETE ON prize_boosts BEGIN SELECT RAISE(ABORT, 'append-only'); END"
                : "CREATE TRIGGER prize_boosts_no_delete BEFORE DELETE ON prize_boosts FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'append-only'");
        };
        $old = require database_path('migrations/2026_11_23_100000_prize_boosts.php');
        $remove = require database_path('migrations/2026_11_23_130000_remove_old_prize_boost_tables.php');

        $create();
        $old->up(); // runs again on deploy: must not trip over the table that is already there
        DB::table('prize_boosts')->insert(['batch' => 'x']);
        try {
            $remove->up();
            $this->fail('removed a table holding a record');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('prize_boosts has rows', $e->getMessage());
        }
        $this->assertTrue(Schema::hasTable('prize_boosts'));

        DB::unprepared('DROP TRIGGER prize_boosts_no_delete');
        DB::table('prize_boosts')->delete();
        $remove->up();
        $this->assertFalse(Schema::hasTable('prize_boosts'));
        $this->assertFalse(Schema::hasTable('boost_prizes'));

        $remove->up(); // and nothing left to do is fine
    }
}
