<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Sprouthub\Verity\Models\InstantPrize;
use Sprouthub\Verity\Models\Winner;

/**
 * The name the site shows for a Verity prize. Verity's own record keeps the name it committed to (it is part
 * of the fair-play proof and never changes); `prize_display_names` can give a prize a different name on the
 * site, in games, winners lists, accounts, emails and the wallet. Every place that shows a prize name to a
 * player goes through here, and the competition page lists each rename so the record can be matched up.
 */
final class PrizeNames
{
    /** [verity competition id => [prize key => shown name]], for one competition or all. */
    public static function map(?int $verityCompetitionId = null): array
    {
        $q = DB::table('prize_display_names');
        if ($verityCompetitionId !== null) {
            $q->where('verity_competition_id', $verityCompetitionId);
        }
        $out = [];
        foreach ($q->get(['verity_competition_id', 'prize_key', 'display_name']) as $r) {
            $out[(int) $r->verity_competition_id][(string) $r->prize_key] = (string) $r->display_name;
        }

        return $out;
    }

    public static function shown(array $map, int $verityCompetitionId, ?string $key, ?string $name): ?string
    {
        return $key !== null && isset($map[$verityCompetitionId][$key]) ? $map[$verityCompetitionId][$key] : $name;
    }

    public static function forWinner(Winner $w): string
    {
        return (string) self::shown(self::map((int) $w->competition_id), (int) $w->competition_id, $w->prize_key, $w->prize_name);
    }

    /** The keys of a competition's prizes shown under this name (renamed ones by their new name only). */
    public static function keysShownAs(int $verityCompetitionId, string $name): array
    {
        $map = self::map($verityCompetitionId);

        return InstantPrize::query()->where('competition_id', $verityCompetitionId)->get(['key', 'name'])
            ->filter(fn ($p) => self::shown($map, $verityCompetitionId, $p->key, $p->name) === $name)
            ->pluck('key')->values()->all();
    }

    /** Renamed prizes of one competition, for the public page: [['from' => Verity's name, 'to' => shown name]]. */
    public static function renamed(int $verityCompetitionId): array
    {
        return DB::table('prize_display_names')->where('verity_competition_id', $verityCompetitionId)
            ->orderBy('id')->get(['original_name', 'display_name'])
            ->map(fn ($r) => ['from' => (string) $r->original_name, 'to' => (string) $r->display_name])
            ->unique(fn ($r) => $r['from'].'|'.$r['to'])->values()->all();
    }
}
