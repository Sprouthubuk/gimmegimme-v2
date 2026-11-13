<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * - Several end-prize winners (Verity draws N places; one end prize per person, see EndPrizeRules).
 * - How an end prize is paid: site_credit (to winnings, automatically) or physical (a claim handled by hand).
 * - Ticket buttons: which preset is "Most popular", and a minimum number of tickets per order line.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('competitions', function (Blueprint $t) {
            $t->unsignedSmallInteger('end_prize_count')->default(1)->after('end_prize_value_pence');
            $t->string('end_prize_type', 16)->default('physical')->after('end_prize_count');
            $t->unsignedInteger('popular_preset')->nullable()->after('presets');
            $t->unsignedInteger('min_tickets')->default(1)->after('max_per_person');
        });
    }

    public function down(): void
    {
        Schema::table('competitions', function (Blueprint $t) {
            $t->dropColumn(['end_prize_count', 'end_prize_type', 'popular_preset', 'min_tickets']);
        });
    }
};
