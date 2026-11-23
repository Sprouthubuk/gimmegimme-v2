<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The first prize-boost build (PR #56) kept added prizes in its own tables, outside Verity. It was replaced
 * by Verity::addInstantPrizes (verity-v3.2.0, docs/prize-boosts.md) before it was ever run, so its two tables
 * are empty: remove them. If either holds a row, the old build was run and a person must look at it first, so
 * this refuses (and the deploy stops) rather than lose a record.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['boost_prizes', 'prize_boosts'] as $table) {
            if (Schema::hasTable($table) && DB::table($table)->exists()) {
                throw new RuntimeException("{$table} has rows: the old prize boost was run. Stop and check before removing it.");
            }
        }
        foreach (['prize_boosts_no_delete', 'boost_prizes_no_delete', 'prize_boosts_no_update', 'boost_prizes_locked'] as $trigger) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$trigger}");
        }
        Schema::dropIfExists('boost_prizes');
        Schema::dropIfExists('prize_boosts');
    }

    public function down(): void
    {
        // Not recreated: the old build is gone and nothing reads these tables.
    }
};
