<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * The reveal games and game skins a competition may use, from shared/game-ids.json (the same file the
 * frontend's tests compare with src/games/gameIds.ts and skinIds.ts). A skin is presentation only:
 * nothing that decides, prices, pays or allocates may read it.
 */
final class GameIds
{
    private static ?array $data = null;

    private static function data(): array
    {
        return self::$data ??= json_decode((string) file_get_contents(base_path('../shared/game-ids.json')), true, 512, JSON_THROW_ON_ERROR);
    }

    /** @return list<string> */
    public static function games(): array
    {
        return self::data()['games'];
    }

    /** @return list<string> */
    public static function skins(): array
    {
        return self::data()['skins'];
    }

    /** @return array<string, string> skin id => admin label */
    public static function skinLabels(): array
    {
        return self::data()['skinLabels'];
    }

    /** True when the skin has its own version of the game (otherwise the classic look plays). */
    public static function skinCovers(?string $skin, ?string $game): bool
    {
        return $skin !== null && $game !== null && in_array($game, self::data()['skinnedGames'][$skin] ?? [], true);
    }

    /**
     * (Re)build the database checks on competitions.skin and competitions.game from this list. MySQL only
     * (the tests' SQLite relies on the model and publishing checks, which say the same). Changes no rows:
     * if a row already holds a value outside the list it refuses before touching anything.
     */
    public static function replaceDatabaseChecks(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }
        $list = fn (array $ids) => implode(', ', array_map(fn ($id) => DB::getPdo()->quote($id), $ids));
        // Refuse before anything is dropped (MySQL can't roll back ALTER TABLE): name the rows to fix first.
        $bad = DB::table('competitions')->whereNotIn('skin', self::skins())
            ->orWhere(fn ($q) => $q->whereNotNull('game')->whereNotIn('game', self::games()))->pluck('slug')->all();
        if ($bad !== []) {
            throw new \RuntimeException('Competitions with a skin or game outside shared/game-ids.json: '.implode(', ', $bad).'. Nothing was changed.');
        }
        foreach (['competitions_skin_check', 'competitions_game_check'] as $name) {
            $exists = DB::selectOne('SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?', ['competitions', $name]);
            if ((int) $exists->n > 0) {
                DB::statement("ALTER TABLE competitions DROP CHECK {$name}");
            }
        }
        DB::statement('ALTER TABLE competitions ADD CONSTRAINT competitions_skin_check CHECK (skin IN ('.$list(self::skins()).'))');
        DB::statement('ALTER TABLE competitions ADD CONSTRAINT competitions_game_check CHECK (game IS NULL OR game IN ('.$list(self::games()).'))');
    }
}
