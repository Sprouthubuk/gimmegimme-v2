<?php

namespace App\Filament\Pages;

use App\Filament\Resources\Competitions\CompetitionResource;
use App\Support\GameIds;
use BackedEnum;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;

/**
 * Every reveal game in every look it has, playable here with made-up tickets (the public /demo page in a
 * frame; nothing is bought or won). For checking how a game looks and plays before using it.
 */
class Games extends Page
{
    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedPuzzlePiece;

    protected static ?string $title = 'Games';

    protected static ?int $navigationSort = 2;

    protected static string|\UnitEnum|null $navigationGroup = 'Competitions';

    protected string $view = 'filament.pages.games';

    /** @return list<array{id: string, label: string, looks: list<array{skin: string, label: string, url: string}>}> */
    public function games(): array
    {
        $labels = GameIds::skinLabels();

        return collect(GameIds::games())->reject(fn ($g) => $g === 'classic') // the old name for Scratch Card's classic reveal
            ->map(fn (string $game) => [
                'id' => $game,
                'label' => CompetitionResource::GAMES[$game] ?? $game,
                'looks' => collect(GameIds::skins())
                    ->filter(fn (string $skin) => $skin === 'classic' || GameIds::skinCovers($skin, $game))
                    ->map(fn (string $skin) => [
                        'skin' => $skin,
                        'label' => trim(preg_replace('/\s*\(.*\)$/', '', $labels[$skin] ?? $skin)),
                        'url' => '/demo/'.$game.'?'.http_build_query(['skin' => $skin]),
                    ])->values()->all(),
            ])->values()->all();
    }
}
