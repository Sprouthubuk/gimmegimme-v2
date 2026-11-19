<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * "Buy X Get Y Free" bundles for live draws. A tier is a global preset; each competition chooses which
 * tiers it offers and which one is featured ("Best Value"). Free tickets are ordinary entries: the order
 * line's quantity is paid + free and every one of them goes to Verity in the same entry.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bundle_tiers', function (Blueprint $t) {
            $t->id();
            $t->string('label', 60)->nullable();          // blank = "Buy 5 Get 5 Free"
            $t->unsignedInteger('paid_qty');
            $t->unsignedInteger('free_qty');
            $t->unsignedInteger('sort_order')->default(0);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['paid_qty', 'free_qty']);
        });

        Schema::create('competition_bundle_tier', function (Blueprint $t) {
            $t->foreignUlid('competition_id')->constrained()->cascadeOnDelete();
            $t->foreignId('bundle_tier_id')->constrained()->cascadeOnDelete();
            $t->boolean('is_featured')->default(false);
            $t->string('override_label', 60)->nullable();
            $t->primary(['competition_id', 'bundle_tier_id']);
        });

        Schema::table('competitions', function (Blueprint $t) {
            $t->boolean('bundles_enabled')->default(false);
            $t->unsignedTinyInteger('max_bundle_share_pct')->default(10); // no single bundle above this % of the tickets
            $t->unsignedInteger('prize_cost_pence')->nullable();          // admin only, for the margin preview
        });

        Schema::table('order_lines', function (Blueprint $t) {
            // quantity stays the total tickets on the line (paid + free); these record how it was made up.
            $t->foreignId('bundle_tier_id')->nullable()->constrained()->nullOnDelete();
            $t->string('bundle_label', 60)->nullable();
            $t->unsignedInteger('paid_quantity')->nullable();
            $t->unsignedInteger('free_quantity')->default(0);
        });
        DB::table('order_lines')->whereNull('paid_quantity')->update(['paid_quantity' => DB::raw('quantity')]);

        $now = now();
        foreach ([[5, 5], [10, 15], [20, 40], [40, 100], [80, 280]] as $i => [$paid, $free]) {
            DB::table('bundle_tiers')->insert(['paid_qty' => $paid, 'free_qty' => $free, 'sort_order' => $i + 1, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
        }
    }

    public function down(): void
    {
        Schema::table('order_lines', function (Blueprint $t) {
            $t->dropConstrainedForeignId('bundle_tier_id');
            $t->dropColumn(['bundle_label', 'paid_quantity', 'free_quantity']);
        });
        Schema::table('competitions', function (Blueprint $t) {
            $t->dropColumn(['bundles_enabled', 'max_bundle_share_pct', 'prize_cost_pence']);
        });
        Schema::dropIfExists('competition_bundle_tier');
        Schema::dropIfExists('bundle_tiers');
    }
};
