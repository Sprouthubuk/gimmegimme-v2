<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cookie banner choices per UK day, totals only (App\Support\ConsentChoices). No visitor id, IP or anything
 * personal: a day and two numbers. Rolling back drops the table and its counts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consent_choices', function (Blueprint $t) {
            $t->date('day')->primary();
            $t->unsignedInteger('accepted')->default(0);
            $t->unsignedInteger('rejected')->default(0);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consent_choices');
    }
};
