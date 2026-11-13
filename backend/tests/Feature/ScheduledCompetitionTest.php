<?php

namespace Tests\Feature;

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
}
