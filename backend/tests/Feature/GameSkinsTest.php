<?php

namespace Tests\Feature;

use App\Services\Publishing;
use App\Support\GameIds;
use Tests\TestCase;

/** Game skins (shared/game-ids.json): presentation only, known values only. */
class GameSkinsTest extends TestCase
{
    public function test_every_themed_skin_can_be_saved_published_and_is_returned_by_the_api(): void
    {
        foreach (['pirates' => 'gems', 'cash_escape' => 'spin_wheel', 'hip_hop' => 'coin_drop', 'smash_cash' => 'balloon_pop', 'christmas' => 'slots'] as $skin => $game) {
            $c = $this->competition('instant', ['skin' => $skin, 'game' => $game]);
            $this->getJson('/api/competitions/'.$c->slug)->assertOk()->assertJsonPath('skin', $skin)->assertJsonPath('game', $game);
            $this->assertTrue(GameIds::skinCovers($skin, $game));
        }
    }

    public function test_competitions_default_to_classic_and_refuse_unknown_skins_and_games(): void
    {
        $c = $this->competition('instant', [], [], false);
        $this->assertSame('classic', $c->refresh()->skin);

        $this->expectException(\DomainException::class);
        $c->forceFill(['skin' => 'easter'])->save();
    }

    public function test_an_unknown_game_is_refused(): void
    {
        $c = $this->competition('instant', [], [], false);
        $this->expectException(\DomainException::class);
        $c->forceFill(['game' => 'roulette'])->save();
    }

    public function test_a_skin_without_that_game_still_publishes_and_plays_the_classic_look(): void
    {
        $c = $this->competition('instant', ['skin' => 'pirates', 'game' => 'slots'], [], false);
        $this->assertFalse(GameIds::skinCovers('pirates', 'slots'));
        $this->assertSame([], app(Publishing::class)->problems($c));
    }

    public function test_nothing_that_decides_prices_pays_or_allocates_reads_the_skin(): void
    {
        // Publishing only checks the value is allowed; Reveal only passes it to the game. Nothing else may read it.
        $allowed = ['Publishing.php', 'Reveal.php'];
        foreach (glob(app_path('Services/*.php')) as $file) {
            if (in_array(basename($file), $allowed, true)) {
                continue;
            }
            $this->assertDoesNotMatchRegularExpression('/\bskin\b/i', (string) file_get_contents($file), basename($file).' reads the game skin');
        }
    }
}
