<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When a player agreed to email and SMS marketing. Set when they tick the box (or brought across from
 * the old site), cleared when they turn it off or self-exclude; empty when the date isn't known.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('marketing_email_consent_at')->nullable()->after('marketing_sms');
            $table->timestamp('marketing_sms_consent_at')->nullable()->after('marketing_email_consent_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['marketing_email_consent_at', 'marketing_sms_consent_at']);
        });
    }
};
