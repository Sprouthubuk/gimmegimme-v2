<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The four launch prizes with "Bonus" in their name carry the amount in the name itself ("25p Blanket Bonus"), so
 * 2026_11_23_150000 (which looked for "Blanket Bonus") missed them. Same rule, same table: shown names only,
 * Verity's record untouched, each matched by its exact Verity name and value.
 */
return new class extends Migration
{
    private const REASON = '23 Nov 2026: no "Jackpot" or "Bonus" in prize names, no repeated names';

    /** [slug, Verity's name, value in pence, shown name] */
    private const RENAMES = [
        ['demis-grinchmas-gold', '£20 Grumpy Green Bonus', 2000, '£20 Grumpy Green Twenty'],
        ['demis-grinchmas-gold', '£10 Bah-Bauble Bonus', 1000, '£10 Bah-Bauble Tenner'],
        ['liams-humbug-heist', '£5 Bah Humbug Bonus', 500, '£5 Bah Humbug Handout'],
        ['blankets-and-banknotes', '25p Blanket Bonus', 25, '25p Blanket Pennies'],
    ];

    public function up(): void
    {
        foreach (self::RENAMES as [$slug, $from, $value, $to]) {
            $ref = DB::table('competitions')->where('slug', $slug)->value('verity_ref');
            $vc = $ref ? DB::table('verity_competitions')->where('ref', $ref)->value('id') : null;
            if ($vc === null) {
                continue; // not on this database (laptops, tests)
            }
            foreach (DB::table('verity_instant_prizes')->where('competition_id', $vc)->where('name', $from)->where('value_pence', $value)->pluck('key') as $key) {
                DB::table('prize_display_names')->updateOrInsert(
                    ['verity_competition_id' => (int) $vc, 'prize_key' => $key],
                    ['original_name' => $from, 'display_name' => $to, 'reason' => self::REASON, 'created_at' => now(), 'updated_at' => now()],
                );
            }
        }
    }

    public function down(): void
    {
        // Leaves the names in place: removing them would put "Bonus" back on the site.
    }
};
