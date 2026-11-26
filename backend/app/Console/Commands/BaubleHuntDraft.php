<?php

namespace App\Console\Commands;

use App\Models\Competition;
use App\Models\HuntTheme;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * The first Mystery Hunt (owner, 26 Nov 2026; docs/mystery-hunt.md), created as a DRAFT with its theme: nothing goes on
 * sale. Add the picture and the bauble artwork in the admin, check the hunt preview, then publish (Verity seals the map
 * then). 20p, 7,500 tickets, 212 instant wins (12 Mystery Baubles), £100 cash end prize: a £387 prize fund at most.
 * Safe to run again: skipped if the web address exists.
 */
class BaubleHuntDraft extends Command
{
    protected $signature = 'gimme:bauble-hunt-draft {--closes= : Closing date and time, UK time, e.g. "2026-12-21 20:00"} {--facebook= : The Facebook group link}';

    protected $description = 'Create The Christmas Bauble Hunt (a Mystery Hunt) and its theme as a draft';

    public const SLUG = 'christmas-bauble-hunt';

    /** name, value (p), quantity, type: the instant wins (the baubles are the hunt symbol, worth £0 themselves) */
    public const INSTANT = [['Mystery Bauble', 0, 12, 'hunt_symbol'], ['£25 Cash', 2500, 1, 'cash'], ['£10 Cash', 1000, 3, 'cash'], ['£5 Cash', 500, 6, 'cash'],
        ['£2 Cash', 200, 10, 'cash'], ['£1 Cash', 100, 20, 'cash'], ['50p Ticket Credit', 50, 40, 'ticket_credit'], ['Ticket Money Back', 20, 120, 'ticket_credit']];

    /** name, type, value (p), quantity: behind the 12 numbers on the board */
    public const HIDDEN = [['£50 Bauble Cash', 'cash', 5000, 1], ['£20 Bauble Cash', 'cash', 2000, 1], ['£10 Bauble Cash', 'cash', 1000, 1], ['£10 Bauble Credit', 'ticket_credit', 1000, 1],
        ['£5 Bauble Credit', 'ticket_credit', 500, 3], ['£3 Bauble Credit', 'ticket_credit', 300, 3], ['£2 Bauble Credit', 'ticket_credit', 200, 2]];

    public function handle(): int
    {
        if (! $this->option('closes')) {
            $this->error('Give the closing time: --closes="2026-12-21 20:00" (UK time).');

            return self::FAILURE;
        }
        $closes = CarbonImmutable::parse((string) $this->option('closes'), 'Europe/London')->utc();
        if ($closes->isPast()) {
            $this->error('The closing time is in the past.');

            return self::FAILURE;
        }
        if (Competition::query()->where('slug', self::SLUG)->exists()) {
            $this->line('skip  The Christmas Bauble Hunt (already exists)');

            return self::SUCCESS;
        }
        DB::transaction(function () use ($closes) {
            $theme = HuntTheme::query()->firstOrCreate(['name' => 'Christmas Baubles'], [
                'symbol_name' => 'Mystery Bauble', 'symbol_plural' => 'Mystery Baubles', 'hashtag' => '#BaubleHunt',
                'facebook_url' => $this->option('facebook') ?: null, 'board_colour' => '#0B3D2E', 'accent_colour' => '#FFD23F',
                'intro' => 'Twelve Mystery Baubles are hidden in the instant wins. Find one and pick a number on the board: there’s a prize behind every one, up to £50 cash.',
            ]);
            $c = Competition::query()->create([
                'slug' => self::SLUG, 'title' => 'The Christmas Bauble Hunt', 'type' => 'instant', 'game' => 'scratch_card', 'skin' => 'christmas',
                'price_pence' => 20, 'max_tickets' => 7500, 'max_per_person' => 750, 'min_tickets' => 5, 'presets' => [5, 10, 25, 50],
                'closes_at' => $closes, 'end_prize_name' => '£100 Cash', 'end_prize_value_pence' => 10000, 'end_prize_count' => 1, 'end_prize_type' => 'site_credit',
                'hunt_theme_id' => $theme->id, 'hunt_claim_hours' => 48, 'subtitle' => '212 instant wins · 12 Mystery Baubles',
                'description' => "212 instant wins, from Ticket Money Back to £25 cash, plus a £100 cash end prize drawn at the close.\n\n"
                    .'Hidden among them are 12 Mystery Baubles. Find one and pick a number on the Hunt Board: behind every number is a prize, up to £50 cash. '
                    ."Which prize is behind which number was sealed by Verity before a single ticket was sold, and the whole map is published when the hunt ends.\n\n"
                    ."You have 48 hours to claim a bauble. One not claimed in time isn't won. Cash goes to your winnings; credit is ticket credit and expires.",
            ]);
            foreach (self::INSTANT as $i => [$name, $value, $qty, $type]) {
                $c->prizes()->create(['name' => $name, 'value_pence' => $value, 'quantity' => $qty, 'type' => $type, 'sort' => $i]);
            }
            foreach (self::HIDDEN as $i => [$name, $type, $value, $qty]) {
                $c->huntPrizes()->create(['name' => $name, 'type' => $type, 'value_pence' => $value, 'quantity' => $qty, 'sort' => $i]);
            }
        });
        $this->info('draft The Christmas Bauble Hunt');
        $this->line('Add the picture (and the bauble artwork in Hunt Themes), check the Mystery Hunt preview, then publish.');

        return self::SUCCESS;
    }
}
