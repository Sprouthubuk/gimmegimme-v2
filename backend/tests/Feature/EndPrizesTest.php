<?php

namespace Tests\Feature;

use App\Services\DrawResults;
use App\Models\LedgerEntry;
use App\Models\PrizeClaim;
use App\Models\User;
use App\Services\Fulfilment;
use App\Services\Publishing;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Sprouthub\Verity\Facades\Verity;
use Sprouthub\Verity\Models\AuditEvent;
use Sprouthub\Verity\Models\Competition as VerityCompetition;
use Sprouthub\Verity\Models\Redraw;
use Sprouthub\Verity\Models\Winner;
use Tests\TestCase;

/** Several end-prize winners (one person can win more than one), site-credit end prizes, ticket buttons and minimums. */
class EndPrizesTest extends TestCase
{
    private function buy(User $u, $c, int $qty)
    {
        return $this->actingAs($u)->postJson('/api/checkout', [
            'lines' => [['competitionId' => $c->id, 'quantity' => $qty]], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid(),
        ]);
    }

    private function closeAndDraw($c): VerityCompetition
    {
        Carbon::setTestNow(now()->addMinutes(31));
        Verity::close($c->verity_ref);
        Carbon::setTestNow(now()->addMinutes(5));
        Verity::draw($c->verity_ref);
        app(DrawResults::class)->publish($c, null, 'auto'); // after the live reveal

        return VerityCompetition::query()->where('ref', $c->verity_ref)->firstOrFail();
    }

    private function instantWithEndPrizes(int $count, array $attrs = [])
    {
        return $this->competition('instant', $attrs + [
            'closes_at' => now()->addMinutes(30), 'max_tickets' => 1000, 'max_per_person' => 1000,
            'end_prize_name' => 'Scrooge’s Fortune', 'end_prize_value_pence' => 10000, 'end_prize_count' => $count, 'end_prize_type' => 'site_credit',
        ], [['£1 Credit', 100, 1, 'site_credit']]);
    }

    public function test_publishing_hands_verity_one_place_per_end_prize(): void
    {
        $c = $this->instantWithEndPrizes(3);
        $v = VerityCompetition::query()->where('ref', $c->verity_ref)->firstOrFail();
        $this->assertSame(3, (int) $v->winner_count);
        $this->assertSame(['Scrooge’s Fortune', 'Scrooge’s Fortune', 'Scrooge’s Fortune'], $v->endPrizes()->orderBy('position')->pluck('name')->all());

        $detail = $this->getJson('/api/competitions/'.$c->slug)->assertOk()->json();
        $this->assertSame(['name' => 'Scrooge’s Fortune', 'valuePence' => 10000, 'count' => 3], $detail['endPrize']);
    }

    public function test_end_prize_settings_are_checked_before_publishing(): void
    {
        $c = $this->competition('draw', ['end_prize_count' => 0, 'max_tickets' => 10, 'max_per_person' => 10], [], false);
        $this->assertContains('The number of end prizes must be between 1 and '.Publishing::MAX_END_PRIZES.'.', app(Publishing::class)->problems($c));
        $c->forceFill(['end_prize_count' => 11])->save();
        $this->assertContains('There are more end prizes than tickets.', app(Publishing::class)->problems($c));
        $c->forceFill(['end_prize_count' => 2, 'end_prize_type' => 'nonsense'])->save();
        $this->assertContains('Choose how the end prize is paid.', app(Publishing::class)->problems($c));
        $c->forceFill(['end_prize_type' => 'site_credit', 'min_tickets' => 11])->save();
        $this->assertNotEmpty(app(Publishing::class)->problems($c));
        $c->forceFill(['min_tickets' => 1])->save();
        $this->assertSame([], app(Publishing::class)->problems($c));
    }

    public function test_two_people_two_places_both_paid_once_as_site_credit(): void
    {
        $a = $this->player();
        $b = $this->player();
        $this->topUp($a, 1000);
        $this->topUp($b, 1000);
        $c = $this->instantWithEndPrizes(2);
        $this->buy($a, $c, 1)->assertCreated();
        $this->buy($b, $c, 1)->assertCreated();
        $v = $this->closeAndDraw($c);

        foreach ([$a, $b] as $u) {
            $this->assertSame(1, LedgerEntry::query()->where('user_id', $u->id)->where('bucket', 'winnings')->where('reason', 'like', 'End prize%')->count());
            $this->assertSame(10000, (int) LedgerEntry::query()->where('user_id', $u->id)->where('reason', 'like', 'End prize%')->sum('amount_pence'));
            $this->assertSame('fulfilled', PrizeClaim::query()->where('user_id', $u->id)->value('status'));
        }
        $this->assertSame(0, Redraw::query()->count());
        // Handling the same result again pays nothing more.
        foreach (Winner::query()->where('type', 'main')->get() as $w) {
            app(Fulfilment::class)->recordDrawWin($w);
        }
        $this->assertSame(2, LedgerEntry::query()->where('reason', 'like', 'End prize%')->count());
    }

    public function test_one_person_can_win_every_end_prize_they_are_drawn_for(): void
    {
        // Owner, 22 Nov 2026: more tickets, more chances. Every place drawn is paid, with no redraw.
        $a = $this->player();
        $this->topUp($a, 1000);
        $c = $this->instantWithEndPrizes(2);
        $this->buy($a, $c, 4)->assertCreated(); // every ticket is A's: both places go to A
        $v = $this->closeAndDraw($c);

        $this->assertSame(2, Winner::query()->where('competition_id', $v->id)->where('type', 'main')->where('status', 'active')->where('owner_ref', 'user:'.$a->id)->count());
        $this->assertSame(2, LedgerEntry::query()->where('user_id', $a->id)->where('bucket', 'winnings')->where('reason', 'like', 'End prize%')->count());
        $this->assertSame(20000, (int) LedgerEntry::query()->where('user_id', $a->id)->where('reason', 'like', 'End prize%')->sum('amount_pence'));
        $this->assertSame(2, PrizeClaim::query()->where('user_id', $a->id)->count());
        $this->assertSame(0, Redraw::query()->count(), 'no redraw for a repeat winner');
        $this->assertSame(0, AuditEvent::query()->where('type', 'draw.winner_forfeited')->count());
        // Handling the same results again pays nothing more.
        foreach (Winner::query()->where('type', 'main')->get() as $w) {
            app(Fulfilment::class)->recordDrawWin($w);
        }
        $this->artisan('schedule:list')->doesntExpectOutputToContain('gimme:end-prize-rules');
        $this->assertSame(2, LedgerEntry::query()->where('user_id', $a->id)->where('reason', 'like', 'End prize%')->count());
    }

    public function test_ticket_buttons_most_popular_and_minimum(): void
    {
        $u = $this->player();
        $this->topUp($u, 1000);
        $c = $this->competition('instant', ['price_pence' => 1, 'max_tickets' => 1000000, 'max_per_person' => 1000000, 'min_tickets' => 100,
            'presets' => ['3000', '500', '1000', '2000'], 'popular_preset' => 1000]);

        $d = $this->getJson('/api/competitions/'.$c->slug)->assertOk()->json();
        $this->assertSame([500, 1000, 2000, 3000], $d['presets']);
        $this->assertSame(1000, $d['popularPreset']);
        $this->assertSame(100, $d['minTickets']);

        $priced = $this->actingAs($u)->postJson('/api/basket/price', ['lines' => [['competitionId' => $c->id, 'quantity' => 99]]])->assertOk()->json('lines.0');
        $this->assertSame('The minimum for this competition is 100 tickets.', $priced['problem']);
        $this->assertSame(100, $priced['minQuantity']);
        $this->buy($u, $c, 99)->assertStatus(422);
        $this->buy($u, $c, 100)->assertCreated();

        // A "Most popular" that isn't one of the buttons is ignored; no buttons means the defaults.
        $c->forceFill(['popular_preset' => 7, 'presets' => null])->saveQuietly();
        $d = $this->getJson('/api/competitions/'.$c->slug)->json();
        $this->assertNull($d['popularPreset']);
        $this->assertSame([5, 10, 25, 50], $d['presets']);
    }

    public function test_descriptions_that_said_one_end_prize_per_person_are_reworded(): void
    {
        $c = $this->instantWithEndPrizes(3);
        $c->forceFill(['description' => 'Plus 3 x £100 end prizes drawn 23 December from every entry. Instant winners can still win, and each end prize goes to a different person.',
            'how_to_play' => 'Every ticket plays one go.'])->save();
        $other = $this->competition('draw', ['description' => 'A different person runs this.']);
        (include database_path('migrations/2026_11_22_233000_end_prizes_repeat_wins_wording.php'))->up();
        $this->assertSame('Plus 3 x £100 end prizes drawn 23 December from every entry. Instant winners can still win, and one person can win more than one end prize.', $c->refresh()->description);
        $this->assertSame('Every ticket plays one go.', $c->how_to_play);
        $this->assertSame('A different person runs this.', $other->refresh()->description);
    }
}
