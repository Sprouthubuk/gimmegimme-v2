<?php

use App\Support\GameIds;
use Illuminate\Database\Migrations\Migration;

/**
 * The themed game skins (pirates, cash_escape, hip_hop, smash_cash) join classic and christmas.
 * competitions.skin already exists (string, default 'classic'): this changes no rows, only adds
 * database checks that skin and game hold allowed values (shared/game-ids.json), on MySQL.
 */
return new class extends Migration
{
    public function up(): void
    {
        GameIds::replaceDatabaseChecks();
    }

    public function down(): void
    {
        // The checks only refuse bad values; leaving them in place on a rollback is harmless.
    }
};
