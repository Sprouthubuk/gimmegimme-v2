<?php

use Illuminate\Database\Migrations\Migration;

/**
 * The first prize-boost build (PR #56) created two tables here, outside Verity. It was replaced by
 * Verity::addInstantPrizes (verity-v3.2.0, docs/prize-boosts.md) and never ran on the live site: its deploy
 * stopped part way through this migration, leaving a `prize_boosts` table behind but no record that the
 * migration ran. So this does nothing now, and 2026_11_23_130000 removes whatever it left, only if empty.
 */
return new class extends Migration
{
    public function up(): void {}

    public function down(): void {}
};
