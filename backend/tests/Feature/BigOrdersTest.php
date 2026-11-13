<?php

namespace Tests\Feature;

use App\Models\LedgerEntry;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Sprouthub\Verity\Models\Entry;
use Sprouthub\Verity\Models\Winner;
use Tests\TestCase;

/**
 * Big orders on big competitions (December 2026: 1p tickets, 1,000,000 tickets, 3,000 in one order).
 * Only winning entries are played through Verity at checkout, so the cost of an order doesn't grow
 * with its ticket count; My Tickets shows a preview and pages the rest.
 */
class BigOrdersTest extends TestCase
{
    public function test_a_3000_ticket_order_on_a_million_ticket_competition_is_quick_and_pays_every_win(): void
    {
        $u = $this->player();
        $this->topUp($u, 10000);
        $c = $this->competition('instant', ['price_pence' => 1, 'max_tickets' => 1000000, 'max_per_person' => 1000000, 'game' => 'gems'],
            [['£250 Chest', 25000, 2, 'site_credit'], ['£1 Penny', 100, 400, 'site_credit']]);

        DB::enableQueryLog();
        $r = $this->actingAs($u)->postJson('/api/checkout', ['lines' => [['competitionId' => $c->id, 'quantity' => 3000]], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid()]);
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();
        $r->assertCreated();
        $this->assertLessThan(200, $queries, "a 3,000-ticket checkout took {$queries} queries");

        // Every ticket that Verity linked to a prize was played and paid, once; no losing ticket was paid.
        $winning = Entry::query()->whereNotNull('instant_ticket_id')->whereHas('group', fn ($q) => $q->where('owner_ref', 'user:'.$u->id));
        $this->assertSame((clone $winning)->count(), Winner::query()->where('type', 'instant')->where('owner_ref', 'user:'.$u->id)->count());
        $this->assertSame((clone $winning)->count(), (clone $winning)->whereNotNull('revealed_at')->count());
        $this->assertSame(Winner::query()->where('type', 'instant')->sum('prize_value_pence'), LedgerEntry::query()->where('user_id', $u->id)->where('bucket', 'winnings')->sum('amount_pence'));

        $number = $r->json('order.number') ?? $r->json('number');
        $this->actingAs($u)->postJson('/api/orders/'.$number.'/play')->assertOk()->assertJsonCount(3000, 'outcome.tickets');

        // My Tickets: a preview of 40 plus any winners, and the count; the full list a page at a time.
        $g = $this->actingAs($u)->getJson('/api/me/tickets?tab=active')->assertOk()->json('data.0');
        $this->assertSame(3000, $g['ticketCount']);
        $this->assertLessThanOrEqual(40 + 402, count($g['tickets']));
        $p1 = $this->actingAs($u)->getJson("/api/me/tickets/{$number}/{$c->id}")->assertOk()->json();
        $this->assertSame([3000, 1, 500, true], [$p1['total'], $p1['page'], $p1['perPage'], $p1['hasMore']]);
        $this->assertCount(500, $p1['data']);
        $p6 = $this->actingAs($u)->getJson("/api/me/tickets/{$number}/{$c->id}?page=6")->json();
        $this->assertFalse($p6['hasMore']);
        $all = array_merge(...array_map(fn ($p) => array_column($this->actingAs($u)->getJson("/api/me/tickets/{$number}/{$c->id}?page={$p}")->json('data'), 'number'), range(1, 6)));
        $this->assertSame(3000, count(array_unique($all)));
        $this->assertGreaterThan(99999, max($all), 'numbers go up to 7 digits');

        // Someone else's order is not found.
        $other = $this->player();
        $this->actingAs($other)->getJson("/api/me/tickets/{$number}/{$c->id}")->assertNotFound();
    }
}
