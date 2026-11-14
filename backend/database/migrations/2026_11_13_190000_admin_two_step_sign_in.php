<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Two-step sign-in for the admin panel (Filament app authentication): the secret and recovery codes, both encrypted. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            $t->text('app_authentication_secret')->nullable();
            $t->text('app_authentication_recovery_codes')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $t) {
            $t->dropColumn(['app_authentication_secret', 'app_authentication_recovery_codes']);
        });
    }
};
