<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Shown names for Verity prizes (owner, 23 Nov 2026): no "Jackpot" or "Bonus" in prize names, and no two
 * prizes in a game with the same name. Verity's record keeps the names it committed to; the site shows these
 * (App\Support\PrizeNames) and lists each rename on the competition page.
 *
 * Also brings the seven boosted games' descriptions up to date with their new prize counts. Each change is
 * made only where the old wording is found, so a description edited since is left alone.
 */
return new class extends Migration
{
    private const REASON = '23 Nov 2026: no "Jackpot" or "Bonus" in prize names, no repeated names';

    /** [slug, Verity's name, value in pence, shown name] */
    private const RENAMES = [
        ['demis-grinchmas-gold', 'Grinchmas Jackpot', 25000, "Grinch's Big Grab"],
        ['demis-grinchmas-gold', 'Grumpy Green Bonus', 2000, 'Grumpy Green Twenty'],
        ['demis-grinchmas-gold', 'Bah-Bauble Bonus', 1000, 'Bah-Bauble Tenner'],
        ['the-great-cash-escape', 'Great Escape Jackpot', 50000, 'The Big Breakout'],
        ['liams-humbug-heist', 'Bah Humbug Bonus', 500, 'Bah Humbug Handout'],
        ['blankets-and-banknotes', 'Duvet Day Jackpot', 50000, 'Big Snuggle Bundle'],
        ['blankets-and-banknotes', 'Blanket Bonus', 25, 'Blanket Pennies'],
        ['blankets-and-banknotes', 'Snuggle Stash', 25000, 'Snuggle Up Stash'],
        ['blankets-and-banknotes', 'Cosy Cash', 10000, 'Cosy Hundred'],
    ];

    /** [slug, [old wording, …], new wording] */
    private const DESCRIPTIONS = [
        ['smash-my-cash', ['one of the 5 x £200 Cash Smash prizes', 'one of the 5 × £200 Cash Smash prizes'], 'one of 896 instant cash prizes up to £250'],
        ['pirates-of-the-prizeibbean', ['443 instant cash prizes'], '1,248 instant cash prizes'],
        ['drop-it-like-its-hot', ['one of 735 instant'], 'one of 2,462 instant'],
        ['the-great-cash-escape', ['72 instant cash prizes'], '815 instant cash prizes'],
        ['liams-humbug-heist', ['one of 1,935 instant'], 'one of 2,065 instant'],
        ['demis-grinchmas-gold', ['one of 2,329 instant'], 'one of 2,436 instant'],
        ['blankets-and-banknotes', ['one of 3,982 instant'], 'one of 4,055 instant'],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('prize_display_names')) {
            Schema::create('prize_display_names', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('verity_competition_id');
                $t->string('prize_key', 64);
                $t->string('original_name', 191);
                $t->string('display_name', 191);
                $t->string('reason', 191);
                $t->timestamps();
                $t->unique(['verity_competition_id', 'prize_key']);
            });
        }

        foreach (self::RENAMES as [$slug, $from, $value, $to]) {
            $vc = $this->verityCompetition($slug);
            if ($vc === null) {
                continue; // not on this database (laptops, tests)
            }
            $keys = DB::table('verity_instant_prizes')->where('competition_id', $vc)->where('name', $from)->where('value_pence', $value)->pluck('key');
            foreach ($keys as $key) {
                DB::table('prize_display_names')->updateOrInsert(
                    ['verity_competition_id' => $vc, 'prize_key' => $key],
                    ['original_name' => $from, 'display_name' => $to, 'reason' => self::REASON, 'created_at' => now(), 'updated_at' => now()],
                );
            }
        }

        foreach (self::DESCRIPTIONS as [$slug, $olds, $new]) {
            $row = DB::table('competitions')->where('slug', $slug)->first(['id', 'description']);
            if (! $row) {
                continue;
            }
            $text = (string) $row->description;
            foreach ($olds as $old) {
                if (str_contains($text, $old)) {
                    DB::table('competitions')->where('id', $row->id)->update(['description' => str_replace($old, $new, $text), 'updated_at' => now()]);
                    break;
                }
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('prize_display_names');
    }

    private function verityCompetition(string $slug): ?int
    {
        $ref = DB::table('competitions')->where('slug', $slug)->value('verity_ref');
        $id = $ref ? DB::table('verity_competitions')->where('ref', $ref)->value('id') : null;

        return $id !== null ? (int) $id : null;
    }
};
