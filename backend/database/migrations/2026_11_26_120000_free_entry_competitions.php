<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Free-to-enter competitions (owner, 26 Nov 2026; docs/free-entry.md): £0, one ticket per person, claimed on the page. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('competitions', function (Blueprint $t) {
            $t->boolean('is_free')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('competitions', function (Blueprint $t) {
            $t->dropColumn('is_free');
        });
    }
};
