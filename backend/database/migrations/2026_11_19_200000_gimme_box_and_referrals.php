<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Gimme Box (a lucky-dip basket builder) and Refer a Friend. Both are switched off by default
 * (settings feature_gimme_box, feature_referrals). Bonus credit reuses the wallet's bonus balance.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('competitions', function (Blueprint $t) {
            $t->boolean('gimme_box_enabled')->default(true);
            $t->decimal('gimme_box_weight', 3, 1)->default(1.0); // 0 to 5
        });

        // A packed box: what the server chose and priced, held for a few minutes so the price shown is honoured.
        Schema::create('gimme_boxes', function (Blueprint $t) {
            $t->string('id', 40)->primary();             // unguessable: whoever has it holds the box
            $t->foreignId('user_id')->nullable()->constrained();
            $t->unsignedInteger('budget_pence');
            $t->string('mode', 12);                      // surprise | big | most
            $t->json('lines');                           // [{competition_id, bundle_tier_id, paid, free, bonus, line_pence}]
            $t->unsignedInteger('total_pence');
            $t->unsignedInteger('tickets');
            $t->string('status', 12)->default('built');  // built | added | ordered | paid | released | expired
            $t->timestamp('expires_at');
            $t->string('order_id', 26)->nullable();
            $t->timestamps();
            $t->index(['status', 'expires_at']);
        });

        Schema::table('order_lines', function (Blueprint $t) {
            $t->unsignedInteger('bonus_quantity')->default(0); // Gimme Box bonus tickets, free, inside quantity
            $t->string('source', 16)->nullable();              // gimme_box | voucher
            $t->string('gimme_box_id', 40)->nullable()->index();
        });

        Schema::table('users', function (Blueprint $t) {
            $t->string('referral_code', 12)->nullable()->unique();
            $t->foreignId('referred_by_id')->nullable()->constrained('users');
            $t->string('signup_device_hash', 64)->nullable()->index();
            $t->string('signup_ip_hash', 64)->nullable()->index();
        });

        Schema::table('orders', function (Blueprint $t) {
            $t->string('card_hash', 64)->nullable()->index(); // a hash of the gateway's card token, never card data
        });

        Schema::create('referrals', function (Blueprint $t) {
            $t->id();
            $t->foreignId('referrer_id')->constrained('users');
            $t->foreignId('friend_id')->unique()->constrained('users'); // a friend is referred once, at sign-up
            $t->string('status', 16)->default('pending'); // pending | rewarded | capped | blocked | review | rejected | clawed_back
            $t->json('reasons')->nullable();
            $t->string('qualifying_order_id', 26)->nullable();
            $t->timestamp('qualified_at')->nullable();
            $t->timestamp('rewarded_at')->nullable();
            $t->timestamps();
            $t->index(['referrer_id', 'status']);
        });

        Schema::create('vouchers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained();
            $t->foreignId('referral_id')->nullable()->constrained();
            $t->unsignedInteger('tickets');
            $t->string('status', 12)->default('available'); // available | redeemed | expired | clawed_back
            $t->timestamp('expires_at');
            $t->foreignUlid('competition_id')->nullable()->constrained();
            $t->string('order_id', 26)->nullable();
            $t->timestamp('redeemed_at')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vouchers');
        Schema::dropIfExists('referrals');
        Schema::table('orders', fn (Blueprint $t) => $t->dropColumn('card_hash'));
        Schema::table('users', function (Blueprint $t) {
            $t->dropConstrainedForeignId('referred_by_id');
            $t->dropColumn(['referral_code', 'signup_device_hash', 'signup_ip_hash']);
        });
        Schema::table('order_lines', fn (Blueprint $t) => $t->dropColumn(['bonus_quantity', 'source', 'gimme_box_id']));
        Schema::dropIfExists('gimme_boxes');
        Schema::table('competitions', fn (Blueprint $t) => $t->dropColumn(['gimme_box_enabled', 'gimme_box_weight']));
    }
};
