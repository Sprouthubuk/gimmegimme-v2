<?php

namespace Tests\Feature;

use App\Models\Competition;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Signed-out visitors (and Facebook's link-preview robot) get the competition list and pages from a few seconds'
 * file cache instead of the database every time; a signed-in player always gets their own fresh answer.
 */
class PublicCacheTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['app.public_cache_seconds' => 10, 'cache.stores.file.path' => storage_path('framework/testing/public-cache-'.getmypid())]);
        Cache::store('file')->flush();
    }

    protected function tearDown(): void
    {
        Cache::store('file')->flush();
        parent::tearDown();
    }

    public function test_signed_out_visitors_are_served_from_a_short_cache_and_players_are_not(): void
    {
        $c = $this->competition('draw');
        $this->getJson('/api/competitions')->assertOk()->assertJsonPath('data.0.title', $c->title);
        $this->getJson('/api/competitions/'.$c->slug)->assertOk()->assertJsonPath('title', $c->title);

        Competition::query()->whereKey($c->id)->update(['title' => 'Renamed']);
        DB::enableQueryLog();
        $this->getJson('/api/competitions')->assertOk()->assertJsonPath('data.0.title', $c->title);
        $this->getJson('/api/competitions/'.$c->slug)->assertOk()->assertJsonPath('title', $c->title);
        $this->assertSame([], array_filter(DB::getQueryLog(), fn ($q) => str_contains($q['query'], 'competitions')), 'served without asking the database');

        // A signed-in player always gets a fresh page with their own details.
        $this->actingAs($this->player())->getJson('/api/competitions/'.$c->slug)->assertOk()->assertJsonPath('title', 'Renamed')->assertJsonPath('heldByMe', 0);

        // After the few seconds, everyone sees the change.
        $this->travel(11)->seconds();
        auth()->forgetGuards();
        $this->getJson('/api/competitions/'.$c->slug)->assertOk()->assertJsonPath('title', 'Renamed');
        $this->getJson('/api/competitions/no-such-competition')->assertNotFound();
    }

    public function test_switched_off_it_always_asks_the_database(): void
    {
        config(['app.public_cache_seconds' => 0]);
        $c = $this->competition('draw');
        $this->getJson('/api/competitions/'.$c->slug)->assertOk();
        Competition::query()->whereKey($c->id)->update(['title' => 'Renamed']);
        $this->getJson('/api/competitions/'.$c->slug)->assertOk()->assertJsonPath('title', 'Renamed');
    }
}
