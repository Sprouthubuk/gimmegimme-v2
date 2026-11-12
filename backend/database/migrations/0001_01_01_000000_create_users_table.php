<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('first_name', 60);
            $table->string('last_name', 60);
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->date('date_of_birth')->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('address_line1', 120)->nullable();
            $table->string('address_line2', 120)->nullable();
            $table->string('city', 80)->nullable();
            $table->string('postcode', 12)->nullable();
            $table->boolean('marketing_email')->default(false);
            $table->boolean('marketing_sms')->default(false);
            $table->boolean('win_notifications')->default(true);
            $table->boolean('is_admin')->default(false);
            $table->boolean('is_staff')->default(false);
            $table->timestamp('id_verified_at')->nullable();
            $table->timestamp('on_hold_at')->nullable();
            $table->string('on_hold_reason', 200)->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamp('cool_off_until')->nullable();
            $table->timestamp('self_excluded_until')->nullable();
            $table->string('legacy_id', 64)->nullable()->unique(); // id on the Lovable site, for the import
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('sessions');
    }
};
