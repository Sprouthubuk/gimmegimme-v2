<?php

use App\Support\GameIds;
use Illuminate\Database\Migrations\Migration;

/**
 * The piñata joins the reveal games (shared/game-ids.json). Changes no rows: it only widens the
 * database check on competitions.game, on MySQL, so the admin can pick the new game.
 */
return new class extends Migration
{
    public function up(): void
    {
        GameIds::replaceDatabaseChecks();
    }

    public function down(): void
    {
        // Narrowing the check again would refuse competitions already set to pinata; leave it.
    }
};
