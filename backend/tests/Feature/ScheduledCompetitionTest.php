<?php

namespace Tests\Feature;

use App\Models\AdminAction;
use App\Services\Publishing;
use Illuminate\Support\Str;
use Sprouthub\Verity\Models\Competition as VerityCompetition;
use Tests\TestCase;

/** A competition published with a future opening time: the API says when it opens, and it can't be bought before. */
class ScheduledCompetitionTest extends TestCase
{
    public function test_a_scheduled_competition_reports_when_it_opens(): void
    {
        $opens = now()->addDays(3)->startOfMinute();
        $c = $this->competition('instant', ['opens_at' => $opens, 'closes_at' => now()->addDays(10)]);

        $this->getJson('/api/competitions/'.$c->slug)->assertOk()
            ->assertJsonPath('status', 'scheduled')
            ->assertJsonPath('opensAt', $opens->toIso8601ZuluString());
    }

    public function test_an_open_competition_has_no_future_opening_time(): void
    {
        $c = $this->competition('instant');

        $this->getJson('/api/competitions/'.$c->slug)->assertOk()->assertJsonPath('status', 'live')->assertJsonPath('opensAt', null);
    }

    public function test_an_admin_can_open_a_scheduled_competition_now_with_its_terms_unchanged(): void
    {
        $c = $this->competition('instant', ['opens_at' => now()->addDays(13), 'closes_at' => now()->addDays(40)]);
        $before = VerityCompetition::query()->where('ref', $c->verity_ref)->firstOrFail();
        $this->assertSame('draft', $before->status);
        $u = $this->player();
        $this->topUp($u, 1000);
        $buy = fn () => $this->actingAs($u)->postJson('/api/checkout', ['lines' => [['competitionId' => $c->id, 'quantity' => 4]], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid()]);
        $this->assertNotSame(201, $buy()->status()); // not on sale before it opens

        app(Publishing::class)->openNow($c, $this->admin(), 'Opening early for launch');

        $after = $before->fresh();
        $this->assertSame('live', $after->status);
        $this->assertSame($before->commitment, $after->commitment); // same seed and prize table
        $this->assertSame([$before->max_tickets, $before->ticket_price_pence, $before->closes_at->toIso8601String()], [$after->max_tickets, $after->ticket_price_pence, $after->closes_at->toIso8601String()]);
        $this->getJson('/api/competitions/'.$c->slug)->assertJsonPath('status', 'live')->assertJsonPath('opensAt', null);
        $this->assertSame('Opening early for launch', AdminAction::query()->where('action', 'competition.opened_early')->value('reason'));
        $buy()->assertCreated();

        $this->expectException(\DomainException::class); // only once
        app(Publishing::class)->openNow($c->refresh(), $this->admin(), 'again');
    }
}
