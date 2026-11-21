<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side Meta events (Conversions API). A row is only made for a visitor who accepted marketing cookies.
 * It holds what's needed to send the event later: the browser's Meta cookies, IP and browser name. The player's
 * email, phone and so on are read from their account when the event is sent and only ever leave hashed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('meta_events', function (Blueprint $t) {
            $t->id();
            $t->string('event_name', 40);           // Purchase | Deposit | CompleteRegistration
            $t->string('event_id', 64);             // the same id the browser pixel sends, so Meta counts it once
            $t->foreignId('user_id')->constrained();
            $t->foreignUlid('order_id')->nullable()->constrained();
            $t->string('status', 12)->default('waiting'); // waiting (order not paid yet) | ready | sent | failed | skipped | expired
            $t->json('context')->nullable();        // fbp, fbc, ip, user agent
            $t->unsignedTinyInteger('attempts')->default(0);
            $t->string('last_error', 200)->nullable();
            $t->timestamp('sent_at')->nullable();
            $t->timestamps();
            $t->unique(['event_name', 'event_id']);
            $t->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('meta_events');
    }
};
