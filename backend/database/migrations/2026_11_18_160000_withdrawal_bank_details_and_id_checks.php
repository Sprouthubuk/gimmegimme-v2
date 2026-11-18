<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bank details on each withdrawal (encrypted at rest), and ID checks a player uploads before their first
 * withdrawal: photo ID and proof of address, kept on the private disk and seen only by admins.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('withdrawals', function (Blueprint $t) {
            $t->text('account_name')->nullable()->after('amount_pence');
            $t->text('sort_code')->nullable()->after('account_name');
            $t->text('account_number')->nullable()->after('sort_code');
        });
        Schema::create('id_checks', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignId('user_id')->constrained();
            $t->string('photo_path');
            $t->string('address_path');
            $t->string('status', 12)->default('pending'); // pending | approved | rejected
            $t->string('note', 300)->nullable();
            $t->foreignId('decided_by')->nullable()->constrained('users');
            $t->timestamp('decided_at')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('id_checks');
        Schema::table('withdrawals', function (Blueprint $t) {
            $t->dropColumn(['account_name', 'sort_code', 'account_number']);
        });
    }
};
