<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-draw cap on promotional free tickets (referral vouchers + Gimme Box bonus tickets), as a % of the
 * draw's tickets. Postal entries are not promotional and are never counted.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('competitions', 'promo_ticket_cap_pct')) {
            Schema::table('competitions', function (Blueprint $t) {
                $t->decimal('promo_ticket_cap_pct', 5, 2)->default(5);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('competitions', 'promo_ticket_cap_pct')) {
            Schema::table('competitions', fn (Blueprint $t) => $t->dropColumn('promo_ticket_cap_pct'));
        }
    }
};
