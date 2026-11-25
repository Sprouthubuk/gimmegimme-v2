<?php

namespace App\Console\Commands;

use App\Models\BundleTier;
use App\Models\Competition;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * The three flash live draws (owner, 25 Nov 2026), created as DRAFTS: nothing goes on sale. Add each picture in the
 * admin, check the details and the margin preview, then publish. All three close and are drawn on Sunday
 * 29 November 2026 at 8pm UK time. Safe to run again: a competition whose web address exists is skipped.
 *
 * Ticket buttons are set in pounds (£1 · £2.50 · £5 · £10, the smallest at the £1 card minimum), bundles give about
 * 10% free at £5 and £10, and nobody can hold more than about 10% of the tickets.
 */
class FlashDrafts extends Command
{
    protected $signature = 'gimme:flash-drafts';

    protected $description = 'Create the three flash live draws (Sunday 29 Nov, 8pm) as drafts, with their bundles';

    public const CLOSES_UK = '2026-11-29 20:00';

    /**
     * slug, title, tickets, price (p), max per person, buttons, prize value (p), prize cost (p), cash alternative (p or null),
     * prize type, bundles [[paid, free], …] (the last is Our Pick), description
     */
    public const DRAWS = [
        ['200-tax-free-cash', '£200 Tax Free Cash', 12000, 5, 1200, [20, 50, 100, 200], 20000, 20000, null, 'site_credit', [[100, 10], [200, 25]],
            "Win £200 cash. One winner, picked at random by Verity on Sunday 29 November at 8pm.\n\nThe £200 is paid straight into the winner's wallet as winnings, ready to withdraw.\n\nBundle and free tickets are entered into the draw exactly like paid tickets."],
        ['gta-6-ultimate-edition', 'GTA 6 Ultimate Edition (PS5 or Xbox)', 13500, 2, 1350, [50, 125, 250, 500], 8999, 8999, 7000, 'physical', [[250, 25], [500, 60]],
            "Win Grand Theft Auto VI Ultimate Edition, boxed, for PlayStation 5 or Xbox Series X|S: the winner chooses. Or take £70 cash instead.\n\nOne winner, picked at random by Verity on Sunday 29 November at 8pm. PEGI 18.\n\nNot affiliated with or endorsed by Rockstar Games, Sony or Microsoft.\n\nBundle and free tickets are entered into the draw exactly like paid tickets."],
        ['amazon-echo-dot-max', 'Amazon Echo Dot Max', 15000, 1, 1500, [100, 250, 500, 1000], 4999, 5000, 4000, 'physical', [[500, 50], [1000, 120]],
            "Win an Amazon Echo Dot Max smart speaker, brand new. Or take £40 cash instead.\n\nOne winner, picked at random by Verity on Sunday 29 November at 8pm.\n\nNot affiliated with or endorsed by Amazon.\n\nBundle and free tickets are entered into the draw exactly like paid tickets."],
    ];

    public function handle(): int
    {
        $closes = CarbonImmutable::parse(self::CLOSES_UK, 'Europe/London')->utc();
        $made = 0;
        foreach (self::DRAWS as [$slug, $title, $tickets, $price, $perPerson, $buttons, $value, $cost, $cashAlt, $prizeType, $tiers, $text]) {
            if (Competition::query()->where('slug', $slug)->exists()) {
                $this->line("skip  {$title} (already exists)");

                continue;
            }
            DB::transaction(function () use ($slug, $title, $tickets, $price, $perPerson, $buttons, $value, $cost, $cashAlt, $prizeType, $tiers, $text, $closes) {
                $c = Competition::query()->create([
                    'slug' => $slug, 'title' => $title, 'type' => 'draw', 'skin' => 'classic',
                    'price_pence' => $price, 'max_tickets' => $tickets, 'max_per_person' => $perPerson, 'min_tickets' => 1,
                    'presets' => $buttons, 'closes_at' => $closes, 'cash_alternative_pence' => $cashAlt,
                    'end_prize_name' => $title, 'end_prize_value_pence' => $value, 'end_prize_count' => 1, 'end_prize_type' => $prizeType,
                    'bundles_enabled' => true, 'max_bundle_share_pct' => 10, 'prize_cost_pence' => $cost,
                    'description' => $text,
                ]);
                $attach = [];
                foreach ($tiers as $i => [$paid, $free]) {
                    $tier = BundleTier::query()->firstOrCreate(['paid_qty' => $paid, 'free_qty' => $free], ['sort_order' => $paid, 'is_active' => true]);
                    $attach[$tier->id] = ['is_featured' => $i === array_key_last($tiers)];
                }
                $c->bundleTiers()->sync($attach);
            });
            $this->info("draft {$title}");
            $made++;
        }
        $this->line("{$made} created. Add each one's picture in the admin, check the details, then publish.");

        return self::SUCCESS;
    }
}
