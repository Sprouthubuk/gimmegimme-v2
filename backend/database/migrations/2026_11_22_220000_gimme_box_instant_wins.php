<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Instant-win games can now go in a Gimme Box, but only once an admin switches them on: every existing
 * instant-win game starts switched off (owner, 22 Nov 2026). Live draws are not touched. Not a published
 * term (Competition::LOCKED_WHEN_PUBLISHED), so changing it on a published game is allowed.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('competitions')->where('type', 'instant')->update(['gimme_box_enabled' => false]);
    }

    public function down(): void
    {
        // Nothing to undo: before this, instant-win games were never packed whatever the switch said.
    }
};
