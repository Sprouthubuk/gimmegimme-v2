<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A draw's result is held until it is published (owner, 25 Nov 2026): after Verity draws, the winner isn't told,
 * paid or shown anywhere until an admin publishes it from the live draw screen or the admin, or the safety net
 * publishes it (App\Services\DrawResults). Draws already drawn before this change count as published.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('competitions', function (Blueprint $t) {
            if (! Schema::hasColumn('competitions', 'result_published_at')) {
                $t->timestamp('result_published_at')->nullable();
                $t->string('result_published_how', 16)->nullable(); // screen | admin | auto | before_hold
            }
        });
        $drawn = DB::table('verity_competitions')->where('status', 'drawn')->pluck('ref');
        DB::table('competitions')->whereIn('verity_ref', $drawn)->whereNull('result_published_at')
            ->update(['result_published_at' => now(), 'result_published_how' => 'before_hold']);
    }

    public function down(): void
    {
        Schema::table('competitions', function (Blueprint $t) {
            $t->dropColumn(['result_published_at', 'result_published_how']);
        });
    }
};
