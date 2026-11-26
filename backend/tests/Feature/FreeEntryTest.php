<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\Order;
use App\Models\Setting;
use App\Services\Publishing;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Free-to-enter competitions (owner, 26 Nov 2026; docs/free-entry.md): £0, one ticket each, claimed on the page. */
class FreeEntryTest extends TestCase
{
    private function free(string $type = 'draw', array $prizes = [], int $tickets = 50): Competition
    {
        return $this->competition($type, ['is_free' => true, 'price_pence' => 0, 'max_per_person' => 1, 'max_tickets' => $tickets, 'gimme_box_enabled' => false], $prizes);
    }

    public function test_a_player_claims_one_free_ticket_and_no_more(): void
    {
        $c = $this->free();
        $u = $this->player();
        $this->getJson("/api/competitions/{$c->slug}")->assertOk()->assertJsonPath('isFree', true)->assertJsonPath('pricePence', 0);

        $this->postJson("/api/competitions/{$c->slug}/free-entry")->assertUnauthorized();
        $number = $this->actingAs($u)->postJson("/api/competitions/{$c->slug}/free-entry")->assertCreated()->json('order.number');
        $order = Order::query()->where('number', $number)->firstOrFail();
        $this->assertSame(['paid', 0, 0], [$order->status, (int) $order->total_pence, (int) $order->card_pence]);
        $this->assertSame('free_entry', $order->lines->first()->source);
        $this->assertCount(1, $this->actingAs($u)->getJson("/api/orders/{$number}")->assertOk()->json('lines.0.tickets'));

        $this->actingAs($u)->postJson("/api/competitions/{$c->slug}/free-entry")->assertStatus(422)->assertJsonPath('code', 'already_entered');
        $this->assertSame(1, Order::query()->where('user_id', $u->id)->count());
        $this->assertSame(['deposit' => 0, 'bonus' => 0, 'winnings' => 0], $this->wallet()->balances($u));
    }

    public function test_a_free_instant_win_plays_and_pays_like_any_other(): void
    {
        $c = $this->free('instant', [['£5 Cash', 500, 2, 'cash']], 2);
        $u = $this->player();
        $this->actingAs($u)->postJson("/api/competitions/{$c->slug}/free-entry")->assertCreated();
        $this->assertSame(500, $this->wallet()->balances($u)['winnings'], 'every ticket wins here');

        // Two tickets, two players: the third finds it sold out.
        $this->actingAs($this->player())->postJson("/api/competitions/{$c->slug}/free-entry")->assertCreated();
        $this->actingAs($this->player())->postJson("/api/competitions/{$c->slug}/free-entry")->assertStatus(422)->assertJsonPath('code', 'closed');
    }

    public function test_the_same_play_checks_apply_and_it_never_goes_through_the_basket(): void
    {
        $c = $this->free();
        $this->actingAs($this->player(['email_verified_at' => null]))->postJson("/api/competitions/{$c->slug}/free-entry")->assertForbidden();
        $this->actingAs($this->player(['self_excluded_until' => now()->addMonth()]))->postJson("/api/competitions/{$c->slug}/free-entry")->assertForbidden();
        $this->actingAs($this->admin())->postJson("/api/competitions/{$c->slug}/free-entry")->assertForbidden();
        Setting::put('sales_open', '0');
        $this->actingAs($this->player())->postJson("/api/competitions/{$c->slug}/free-entry")->assertJsonPath('code', 'sales_closed');
        Setting::put('sales_open', '1');

        $u = $this->player();
        $this->topUp($u, 1000);
        $this->actingAs($u)->postJson('/api/checkout', ['lines' => [['competitionId' => $c->id, 'quantity' => 1]], 'payWith' => 'wallet', 'requestId' => (string) Str::uuid()])
            ->assertStatus(422);
        $paid = $this->competition('draw');
        $this->actingAs($u)->postJson("/api/competitions/{$paid->slug}/free-entry")->assertStatus(422)->assertJsonPath('code', 'not_free');
    }

    public function test_a_free_competition_must_be_free_and_one_each_to_publish(): void
    {
        $c = $this->competition('draw', ['is_free' => true, 'price_pence' => 10, 'max_per_person' => 1, 'gimme_box_enabled' => false], [], false);
        $this->assertContains('A free competition is £0 a ticket and 1 ticket per person.', app(Publishing::class)->problems($c));
        $c->update(['price_pence' => 0, 'max_per_person' => 2]);
        $this->assertContains('A free competition is £0 a ticket and 1 ticket per person.', app(Publishing::class)->problems($c->refresh()));
        $c->update(['max_per_person' => 1]);
        $this->assertSame([], app(Publishing::class)->problems($c->refresh()));
        $c->update(['is_free' => false, 'price_pence' => 0]);
        $this->assertNotEmpty(app(Publishing::class)->problems($c->refresh()), 'a paid competition still needs a price');
    }
}
