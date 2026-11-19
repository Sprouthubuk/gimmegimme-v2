<?php

namespace App\Console\Commands;

use App\Models\BundleTier;
use App\Models\Competition;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The five launch live draws, created as DRAFTS with their bundles (the owner's brief, 19 Nov 2026).
 * Nothing goes on sale: add the picture, prize value, dates and description in the admin, check the
 * margin preview, then publish. Safe to run again: a competition whose web address exists is skipped.
 */
class LaunchDrafts extends Command
{
    protected $signature = 'gimme:launch-drafts';

    protected $description = 'Create the five launch live draws as drafts, with their bundles';

    /** title, tickets, price (p), prize cost (p), tiers [paid, free], featured [paid, free] */
    public const DRAWS = [
        ['Meta Quest 3S 128GB', 3999, 59, 24000, [[5, 5], [10, 15], [20, 40], [40, 100], [80, 280]], [10, 15]],
        ['Shark FacialPro Glow', 2499, 79, 24000, [[5, 5], [10, 15], [20, 40], [40, 100]], [10, 15]],
        ['Shark FlexStyle Air Styler', 1999, 69, 17000, [[5, 5], [10, 15], [20, 40], [40, 100]], [10, 15]],
        ['Apple AirPods 5', 799, 99, 11900, [[5, 5], [10, 15], [20, 40]], [5, 5]],
        ['Ninja Crispi', 1499, 49, 12000, [[5, 5], [10, 15], [20, 40]], [10, 15]],
    ];

    public function handle(): int
    {
        $made = 0;
        foreach (self::DRAWS as [$title, $tickets, $price, $cost, $tiers, $featured]) {
            $slug = Str::slug($title);
            if (Competition::query()->where('slug', $slug)->exists()) {
                $this->line("skip  {$title} (already exists)");

                continue;
            }
            DB::transaction(function () use ($title, $slug, $tickets, $price, $cost, $tiers, $featured) {
                $c = Competition::query()->create([
                    'slug' => $slug, 'title' => $title, 'type' => 'draw', 'skin' => 'classic',
                    'price_pence' => $price, 'max_tickets' => $tickets, 'max_per_person' => $tickets, 'min_tickets' => 1,
                    // A placeholder: set the real closing date and time in the admin before publishing.
                    'closes_at' => now('Europe/London')->addDays(30)->setTime(20, 0)->utc(),
                    'end_prize_name' => $title, 'end_prize_count' => 1, 'end_prize_type' => 'physical',
                    'bundles_enabled' => true, 'max_bundle_share_pct' => 10, 'prize_cost_pence' => $cost,
                    // Draft wording for the owner to finish. The maximum number of entries is not shown on the site;
                    // say here whether this competition's terms state it (it is published on the fair play record at the close).
                    'description' => "Win the {$title}. One winner, picked at random by Verity.\n\nBundle and free tickets are entered into the draw exactly like paid tickets.\n\n[OWNER TO DECIDE before publishing: state the maximum number of entries here, or delete this line.]",
                ]);
                $attach = [];
                foreach ($tiers as [$paid, $free]) {
                    $tier = BundleTier::query()->firstOrCreate(['paid_qty' => $paid, 'free_qty' => $free], ['sort_order' => $paid, 'is_active' => true]);
                    $attach[$tier->id] = ['is_featured' => [$paid, $free] === $featured];
                }
                $c->bundleTiers()->sync($attach);
            });
            $this->info("draft {$title}");
            $made++;
        }
        $this->line("{$made} created. Add each one's picture, prize value, closing date and description in the admin, then publish.");

        return self::SUCCESS;
    }
}
