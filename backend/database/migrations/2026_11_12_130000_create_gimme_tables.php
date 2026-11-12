<?php

use App\Support\LedgerGuards;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The host's own tables. Verity owns competitions' fairness data (verity_*); these hold what the site
 * shows and sells, the money, and the player's safer-play settings. Money is whole pence everywhere.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $t) {
            $t->string('key', 64)->primary();
            $t->text('value')->nullable();
            $t->timestamps();
        });

        Schema::create('competitions', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('slug', 120)->unique();
            $t->string('title', 120);
            $t->string('type', 8);                       // instant | draw
            $t->string('game', 32)->nullable();          // reveal game id (shared/game-ids.json), instant only
            $t->string('skin', 32)->default('classic');
            $t->string('image', 500)->nullable();
            $t->unsignedInteger('price_pence');
            $t->unsignedInteger('max_tickets');
            $t->unsignedInteger('max_per_person');
            $t->json('presets')->nullable();             // ticket quick-picks, e.g. [5,10,25,50]
            $t->timestamp('opens_at')->nullable();
            $t->timestamp('closes_at');
            $t->unsignedInteger('cash_alternative_pence')->nullable();
            $t->string('subtitle', 120)->nullable();
            $t->text('description')->nullable();
            $t->text('how_to_play')->nullable();
            $t->json('tags')->nullable();
            $t->boolean('featured')->default(false);
            $t->string('end_prize_name', 120)->nullable();
            $t->unsignedInteger('end_prize_value_pence')->nullable();
            $t->string('verity_ref', 64)->nullable()->unique(); // set once published to Verity; terms are then fixed
            $t->timestamp('published_at')->nullable();
            $t->timestamp('ended_at')->nullable();
            $t->timestamps();
            $t->index(['published_at', 'closes_at']);
        });

        // Instant-win prize tiers as entered by the admin (copied to Verity at publish, which fixes them).
        Schema::create('competition_prizes', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('competition_id')->constrained()->cascadeOnDelete();
            $t->string('name', 120);
            $t->unsignedInteger('value_pence');
            $t->string('type', 16)->default('site_credit'); // cash | site_credit | physical
            $t->unsignedInteger('quantity');
            $t->unsignedSmallInteger('sort')->default(0);
        });

        Schema::create('promo_codes', function (Blueprint $t) {
            $t->id();
            $t->string('code', 32)->unique();
            $t->unsignedTinyInteger('percent_off');      // at most 50 (checked in the model and the service)
            $t->unsignedInteger('max_uses')->nullable();
            $t->unsignedInteger('uses')->default(0);
            $t->timestamp('expires_at')->nullable();
            $t->boolean('active')->default(true);
            $t->timestamps();
        });

        Schema::create('orders', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('number', 20)->unique();          // GG-… tickets, GD-… deposits
            $t->foreignId('user_id')->constrained();
            $t->string('order_type', 8);                 // tickets | deposit
            $t->string('status', 16);                    // created | pending_payment | paid | failed | cancelled | expired | refunded
            $t->unsignedInteger('total_pence');          // what the tickets cost after any discount (deposit: the amount)
            $t->unsignedInteger('card_pence');           // the card part only
            $t->unsignedInteger('wallet_pence')->default(0);
            $t->unsignedInteger('paid_deposit_pence')->default(0);
            $t->unsignedInteger('paid_bonus_pence')->default(0);
            $t->unsignedInteger('paid_winnings_pence')->default(0);
            $t->string('promo_code', 32)->nullable();
            $t->unsignedInteger('discount_pence')->default(0);
            $t->string('request_id', 64)->nullable();
            $t->string('gateway_ref', 64)->nullable()->unique(); // Cashflows job reference, written once
            $t->string('gateway_url', 500)->nullable();  // the payment page, so a repeated checkout goes back to it
            $t->string('card_type', 16)->nullable();     // debit | credit (known after payment)
            $t->boolean('needs_attention')->default(false);
            $t->string('attention_reason', 300)->nullable();
            $t->timestamp('paid_at')->nullable();
            $t->timestamp('closed_at')->nullable();
            $t->timestamp('fulfilled_at')->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'request_id']);
            $t->index(['status', 'created_at']);
        });

        Schema::create('order_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('order_id')->constrained();
            $t->foreignUlid('competition_id')->constrained();
            $t->unsignedInteger('quantity');
            $t->unsignedInteger('unit_pence');
            $t->unsignedInteger('line_pence');
            $t->string('entry_group_ref', 32)->nullable(); // Verity ORD-… once entered
            $t->string('owner_tag', 12)->nullable();
            $t->json('tickets')->nullable();
            $t->timestamp('revealed_at')->nullable();    // the player has watched the reveal
        });

        // The wallet: append-only. A balance is the sum of its rows; nothing is ever updated or deleted.
        Schema::create('wallet_ledger', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained();
            $t->string('bucket', 10);                    // deposit | bonus | winnings
            $t->string('direction', 6);                  // credit | debit
            $t->unsignedInteger('amount_pence');
            $t->string('reason', 120);
            $t->string('reference', 120)->nullable()->unique(); // idempotency: one row per event
            $t->foreignUlid('order_id')->nullable()->constrained();
            $t->timestamp('expires_at')->nullable();     // bonus credit only
            $t->timestamp('created_at')->useCurrent();
            $t->index(['user_id', 'bucket']);
        });

        Schema::create('withdrawals', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignId('user_id')->constrained();
            $t->unsignedInteger('amount_pence');
            $t->string('status', 12)->default('requested'); // requested | paid | rejected
            $t->string('note', 300)->nullable();
            $t->foreignId('decided_by')->nullable()->constrained('users');
            $t->timestamp('decided_at')->nullable();
            $t->timestamps();
        });

        // Prizes that need a person: physical prizes, and draw wins.
        Schema::create('prize_claims', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('verity_winner_id')->unique();
            $t->foreignId('user_id')->constrained();
            $t->foreignUlid('competition_id')->constrained();
            $t->string('prize_name', 160);
            $t->unsignedInteger('value_pence');
            $t->string('kind', 10);                      // instant | draw
            $t->string('status', 12)->default('open');   // open | fulfilled
            $t->timestamps();
        });

        Schema::create('spend_limits', function (Blueprint $t) {
            $t->foreignId('user_id')->primary()->constrained();
            $t->unsignedInteger('weekly_deposit_pence')->nullable();
            $t->unsignedInteger('pending_weekly_deposit_pence')->nullable();
            $t->boolean('pending_remove')->default(false);
            $t->timestamp('pending_applies_at')->nullable();
            $t->unsignedSmallInteger('session_minutes')->nullable();
            $t->boolean('weekly_summary')->default(false);
            $t->timestamps();
        });

        Schema::create('postal_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('competition_id')->constrained();
            $t->foreignId('user_id')->nullable()->constrained();
            $t->timestamp('received_at');
            $t->string('status', 12);                    // entered | refused
            $t->string('reason', 200)->nullable();
            $t->string('entry_group_ref', 32)->nullable();
            $t->foreignId('logged_by')->constrained('users');
            $t->timestamps();
        });

        Schema::create('contact_messages', function (Blueprint $t) {
            $t->id();
            $t->string('name', 100);
            $t->string('email');
            $t->string('topic', 60);
            $t->text('message');
            $t->string('ip', 45)->nullable();
            $t->timestamp('handled_at')->nullable();
            $t->timestamps();
        });

        Schema::create('pages', function (Blueprint $t) {
            $t->string('slug', 40)->primary();
            $t->string('title', 120);
            $t->string('version', 20)->default('1');
            $t->longText('html');
            $t->timestamps();
        });

        Schema::create('admin_actions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('admin_id')->constrained('users');
            $t->string('action', 60);
            $t->string('subject', 120)->nullable();
            $t->string('reason', 300)->nullable();
            $t->json('detail')->nullable();
            $t->timestamp('created_at')->useCurrent();
        });

        LedgerGuards::install();
    }

    public function down(): void
    {
        LedgerGuards::uninstall();
        foreach (['admin_actions', 'pages', 'contact_messages', 'postal_entries', 'spend_limits', 'prize_claims', 'withdrawals',
            'wallet_ledger', 'order_lines', 'orders', 'promo_codes', 'competition_prizes', 'competitions', 'settings'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
