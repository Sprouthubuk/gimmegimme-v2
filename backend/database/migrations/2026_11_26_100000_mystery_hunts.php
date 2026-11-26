<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mystery Hunts (owner, 26 Nov 2026; docs/mystery-hunt.md). A theme is reusable; a competition is a hunt when it has a
 * theme and an instant prize of type hunt_symbol. The prizes behind the symbols are hunt_prizes; Verity seals which is
 * behind which number at publish (spec §18). Each symbol won is a hunt_claim; picking a number pays it once.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hunt_themes', function (Blueprint $t) {
            $t->id();
            $t->string('name', 80);
            $t->string('symbol_name', 60);          // "Mystery Bauble"
            $t->string('symbol_plural', 60);        // "Mystery Baubles"
            $t->string('hashtag', 60)->nullable();  // "#BaubleHunt"
            $t->string('facebook_url', 300)->nullable();
            $t->text('intro')->nullable();
            $t->string('symbol_image', 300)->nullable();
            $t->string('board_colour', 9)->default('#0B3D2E');
            $t->string('accent_colour', 9)->default('#FFD23F');
            $t->timestamps();
        });
        Schema::table('competitions', function (Blueprint $t) {
            $t->foreignId('hunt_theme_id')->nullable()->constrained('hunt_themes');
            $t->unsignedSmallInteger('hunt_claim_hours')->default(48);
        });
        Schema::create('hunt_prizes', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('competition_id')->constrained()->cascadeOnDelete();
            $t->string('name', 120);
            $t->string('type', 16);                 // cash | ticket_credit
            $t->unsignedInteger('value_pence');
            $t->unsignedInteger('quantity');
            $t->unsignedSmallInteger('sort')->default(0);
        });
        Schema::create('hunt_claims', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('competition_id')->constrained();
            $t->foreignId('user_id')->constrained();
            $t->unsignedBigInteger('verity_winner_id')->unique();
            $t->unsignedInteger('ticket_number');
            $t->string('status', 12)->default('found'); // found → picked | expired
            $t->timestamp('found_at');
            $t->timestamp('deadline_at');
            $t->timestamp('reminded_at')->nullable();
            $t->unsignedInteger('number')->nullable();
            $t->unsignedInteger('prize_index')->nullable();
            $t->string('prize_name', 120)->nullable();
            $t->string('prize_type', 16)->nullable();
            $t->unsignedInteger('prize_value_pence')->nullable();
            $t->string('claimed_via', 16)->nullable(); // facebook | email
            $t->foreignId('picked_by')->nullable()->constrained('users');
            $t->timestamp('picked_at')->nullable();
            $t->timestamps();
            $t->unique(['competition_id', 'number']);
            $t->index(['status', 'deadline_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hunt_claims');
        Schema::dropIfExists('hunt_prizes');
        Schema::table('competitions', function (Blueprint $t) {
            $t->dropConstrainedForeignId('hunt_theme_id');
            $t->dropColumn('hunt_claim_hours');
        });
        Schema::dropIfExists('hunt_themes');
    }
};
