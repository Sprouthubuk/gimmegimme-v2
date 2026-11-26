<?php

namespace Database\Seeders;

use App\Models\ArchiveCompetition;
use App\Models\BundleTier;
use App\Models\Competition;
use App\Models\HuntTheme;
use App\Models\Page;
use App\Models\Setting;
use App\Models\User;
use App\Services\Publishing;
use App\Services\Wallet;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use Sprouthub\Verity\Facades\Verity;
use Sprouthub\Verity\Models\InstantAddition;

/**
 * Sample data for a developer's machine and the full-stack tests. Refuses to run in production:
 * the live database starts empty of Verity data (Verity's go-live checks fail otherwise).
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('production')) {
            throw new \RuntimeException('Demo data is never seeded in production.');
        }
        Setting::put('sales_open', '1');

        $admin = User::query()->firstOrNew(['email' => 'admin@example.com']);
        $admin->forceFill(['first_name' => 'Demi', 'last_name' => 'Admin', 'password' => 'admin-password-123', 'email_verified_at' => now(), 'is_admin' => true, 'is_staff' => true])->save();

        $player = User::query()->firstOrNew(['email' => 'player@example.com']);
        $player->forceFill(['first_name' => 'Liam', 'last_name' => 'Player', 'password' => 'password123', 'email_verified_at' => now(), 'date_of_birth' => '1990-01-01'])->save();
        app(Wallet::class)->credit($player, 'deposit', 1250, 'Sample top up', 'demo:player:deposit');

        $images = base_path('../frontend/mock-api/images');
        foreach (glob($images.'/*.webp') ?: [] as $f) {
            Storage::disk('public')->put('competitions/'.basename($f), file_get_contents($f));
        }

        $make = function (array $attrs, array $prizes = []) use ($admin): void {
            if (Competition::query()->where('slug', $attrs['slug'])->exists()) {
                return;
            }
            $c = Competition::query()->create($attrs + ['price_pence' => 25, 'max_tickets' => 5000, 'max_per_person' => 500, 'closes_at' => now()->addDays(10)]);
            foreach ($prizes as $i => [$name, $value, $qty, $type]) {
                $c->prizes()->create(['name' => $name, 'value_pence' => $value, 'quantity' => $qty, 'type' => $type, 'sort' => $i]);
            }
            if ($c->bundles_enabled) { // the first three bundle tiers, Buy 10 Get 15 Free as Our Pick
                $c->bundleTiers()->sync(BundleTier::query()->orderBy('sort_order')->take(3)->get()->mapWithKeys(fn ($t) => [$t->id => ['is_featured' => $t->paid_qty === 10]])->all());
            }
            app(Publishing::class)->publish($c, $admin);
        };
        $make(['slug' => 'bush-bucks-jungle-trial', 'title' => 'Bush Bucks – Jungle Trial', 'type' => 'instant', 'game' => 'balloon_pop', 'image' => 'competitions/bush.webp', 'featured' => true,
            'presets' => [5, 10, 20, 50, 100, 200, 500], 'popular_preset' => 20, 'min_tickets' => 4,
            'end_prize_name' => 'Jungle Jackpot', 'end_prize_value_pence' => 5000, 'end_prize_count' => 2, 'end_prize_type' => 'site_credit',
            'description' => 'Every ticket plays one game. Your result is fixed when you buy: the game just reveals it.'],
            [['£500 Cash', 50000, 1, 'cash'], ['£5 Site Credit', 500, 100, 'site_credit'], ['50p Site Credit', 50, 1500, 'site_credit']]);
        $make(['slug' => 'cash-bang', 'title' => 'Cash Bang', 'type' => 'instant', 'game' => 'scratch_card', 'skin' => 'christmas', 'image' => 'competitions/cash.webp', 'price_pence' => 10],
            [['£50 Cash', 5000, 2, 'cash'], ['20p Site Credit', 20, 1000, 'site_credit']]);
        $make(['slug' => 'lush-snow-fairy-wonderland', 'title' => 'Lush Snow Fairy Wonderland', 'type' => 'draw', 'image' => 'competitions/lush.webp', 'price_pence' => 49,
            'end_prize_name' => 'Lush Snow Fairy Gift Set', 'end_prize_value_pence' => 6000, 'cash_alternative_pence' => 5000, 'max_tickets' => 999, 'max_per_person' => 999, 'bundles_enabled' => true, 'max_bundle_share_pct' => 10, 'prize_cost_pence' => 4000]);

        // Free to enter (docs/free-entry.md): £0, one ticket each.
        $make(['slug' => 'free-festive-fiver', 'title' => 'Free Festive Fiver', 'type' => 'draw', 'image' => 'competitions/lush.webp', 'price_pence' => 0, 'is_free' => true,
            'max_tickets' => 5000, 'max_per_person' => 1, 'gimme_box_enabled' => false, 'closes_at' => now()->addDays(5),
            'end_prize_name' => '£5 Site Credit', 'end_prize_value_pence' => 500, 'end_prize_type' => 'site_credit']);

        // A Mystery Hunt (docs/mystery-hunt.md): 12 baubles in the instant wins, a prize behind each number on the board.
        if (! Competition::query()->where('slug', 'christmas-bauble-hunt')->exists()) {
            $theme = HuntTheme::query()->firstOrCreate(['name' => 'Christmas Baubles'], ['symbol_name' => 'Mystery Bauble', 'symbol_plural' => 'Mystery Baubles',
                'hashtag' => '#BaubleHunt', 'facebook_url' => 'https://www.facebook.com/groups/gimmegimmeprizes',
                'intro' => 'Twelve Mystery Baubles are hidden in the instant wins. Find one and pick a number on the board: there’s a prize behind every one.']);
            $hunt = Competition::query()->create(['slug' => 'christmas-bauble-hunt', 'title' => 'The Christmas Bauble Hunt', 'type' => 'instant', 'game' => 'scratch_card', 'skin' => 'christmas',
                'image' => 'competitions/scrooge.webp', 'price_pence' => 20, 'max_tickets' => 7500, 'max_per_person' => 7500, 'closes_at' => now()->addDays(10),
                'end_prize_name' => '£100 Cash', 'end_prize_value_pence' => 10000, 'end_prize_type' => 'site_credit', 'hunt_theme_id' => $theme->id, 'hunt_claim_hours' => 48]);
            foreach ([['Mystery Bauble', 0, 12, 'hunt_symbol'], ['£25 Cash', 2500, 1, 'cash'], ['Ticket Money Back', 20, 120, 'ticket_credit']] as $i => [$name, $value, $qty, $type]) {
                $hunt->prizes()->create(['name' => $name, 'value_pence' => $value, 'quantity' => $qty, 'type' => $type, 'sort' => $i]);
            }
            foreach ([['£50 Bauble Cash', 'cash', 5000, 1], ['£20 Bauble Cash', 'cash', 2000, 1], ['£10 Bauble Cash', 'cash', 1000, 1], ['£10 Bauble Credit', 'ticket_credit', 1000, 1],
                ['£5 Bauble Credit', 'ticket_credit', 500, 3], ['£3 Bauble Credit', 'ticket_credit', 300, 3], ['£2 Bauble Credit', 'ticket_credit', 200, 2]] as $i => [$name, $type, $value, $qty]) {
                $hunt->huntPrizes()->create(['name' => $name, 'type' => $type, 'value_pence' => $value, 'quantity' => $qty, 'sort' => $i]);
            }
            app(Publishing::class)->publish($hunt, $admin);
        }

        // A prize boost on Cash Bang (Verity adds the prizes, spec §17), so the pages and the reveal show added prizes.
        $bang = Competition::query()->where('slug', 'cash-bang')->first();
        if ($bang && ! InstantAddition::query()->whereHas('competition', fn ($q) => $q->where('ref', $bang->verity_ref))->exists()) {
            Verity::addInstantPrizes($bang->verity_ref, [['name' => 'Bang Bonus', 'quantity' => 2, 'value_pence' => 2500, 'meta' => ['type' => 'site_credit']],
                ['name' => 'Mini Bang', 'quantity' => 1500, 'value_pence' => 10, 'meta' => ['type' => 'site_credit']]], 'Prize boost – 23 Nov 2026', 'demo');
        }

        // A small sample of the old site's archive (the real one comes from resources/archive on deploy).
        if (! ArchiveCompetition::query()->exists()) {
            $old = ArchiveCompetition::query()->create(['legacy_id' => 'demo-old-draw', 'slug' => 'old-tax-free-cash', 'title' => '£250 Tax-Free Cash – Live Draw',
                'kind' => 'draw', 'image' => 'competitions/cash.webp', 'price_pence' => 99, 'drawn_at' => now()->subDays(1)->setTime(20, 0)]);
            $old->winners()->create(['legacy_id' => 'demo-old-w1', 'kind' => 'main', 'name' => 'Abbie F.', 'town' => 'Barrow-in-Furness',
                'prize_name' => '£250 Tax-Free Cash', 'value_pence' => 25000, 'ticket_number' => 2, 'won_at' => now()->subDays(1)->setTime(20, 3)]);
            $pop = ArchiveCompetition::query()->create(['legacy_id' => 'demo-old-instant', 'slug' => 'old-pop-for-pennies', 'title' => 'Pop For Pennies – Instant Win',
                'kind' => 'instant', 'image' => 'competitions/bush.webp', 'price_pence' => 1, 'drawn_at' => now()->subDays(1)->setTime(20, 0)]);
            $pop->winners()->create(['legacy_id' => 'demo-old-i1', 'kind' => 'instant', 'name' => 'Jamie D.', 'prize_name' => '£0.05 Tiny Pop',
                'value_pence' => 5, 'ticket_number' => 3, 'won_at' => now()->subDays(2)]);
            foreach ([[$old, ['Sam K.', 'Abbie F.', 'Entrant']], [$pop, ['Lou', 'Kim S.', 'Jamie D.']]] as [$c, $names]) {
                foreach ($names as $i => $n) {
                    $c->entries()->create(['ticket_number' => $i + 1, 'name' => $n, 'source' => $n === 'Entrant' ? 'postal' : 'paid']);
                }
            }
        }

        foreach (['terms' => 'Terms & Conditions', 'privacy' => 'Privacy Policy', 'cookies' => 'Cookie Policy', 'free-entry' => 'Free Entry Terms', 'complaints' => 'Complaints'] as $slug => $title) {
            Page::query()->firstOrCreate(['slug' => $slug], ['title' => $title, 'version' => 'sample',
                'html' => '<h2>Sample wording</h2><p>This is placeholder text for a developer’s machine. The real wording is entered in the admin.</p>']);
        }
    }
}
