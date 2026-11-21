<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The old (Lovable) site's competitions, winners and entry lists, kept as a read-only archive so players
 * can still look them up. Filled only by `gimme:import-archive` from resources/archive/*.csv: exactly what
 * the old site showed publicly (masked names), never anything Verity holds. These draws weren't run through
 * Verity, so the archive is shown apart from the verifiable records and never counts as one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('archive_competitions', function (Blueprint $t) {
            $t->id();
            $t->string('legacy_id', 64)->unique();
            $t->string('slug', 191)->unique();
            $t->string('title');
            $t->string('kind', 16);                 // draw | instant
            $t->string('image')->nullable();        // public disk path, or the old address if it couldn't be copied
            $t->unsignedInteger('price_pence')->default(0);
            $t->timestamp('drawn_at')->nullable();
            $t->timestamps();
        });
        Schema::create('archive_winners', function (Blueprint $t) {
            $t->id();
            $t->foreignId('archive_competition_id')->constrained()->cascadeOnDelete();
            $t->string('legacy_id', 64)->unique();
            $t->string('kind', 16);                 // main | instant
            $t->string('name', 80);                 // masked, as the old site showed it
            $t->string('town', 80)->nullable();
            $t->string('prize_name');
            $t->unsignedInteger('value_pence')->default(0);
            $t->unsignedInteger('ticket_number')->nullable();
            $t->timestamp('won_at')->nullable();
            $t->index(['archive_competition_id', 'kind', 'won_at']);
        });
        Schema::create('archive_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('archive_competition_id')->constrained()->cascadeOnDelete();
            $t->unsignedInteger('ticket_number');
            $t->string('name', 80);                 // masked
            $t->string('source', 16);               // paid | postal
            $t->unique(['archive_competition_id', 'ticket_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('archive_entries');
        Schema::dropIfExists('archive_winners');
        Schema::dropIfExists('archive_competitions');
    }
};
