<?php

namespace Tests\Feature;

use App\Console\Commands\ImportArchive;
use App\Models\ArchiveCompetition;
use App\Models\ArchiveEntry;
use App\Models\ArchiveWinner;
use App\Models\Setting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** The old site's public record: imported only as masked names, shown read-only, never as a Verity record. */
class ArchiveTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dir = sys_get_temp_dir().'/gg-archive-'.uniqid();
        mkdir($this->dir);
        Storage::fake('public');
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
        Http::fake(['*' => Http::response($png, 200, ['Content-Type' => 'image/png'])]);
    }

    protected function tearDown(): void
    {
        array_map('unlink', glob($this->dir.'/*') ?: []);
        @rmdir($this->dir);
        parent::tearDown();
    }

    private function files(array $override = []): void
    {
        $files = $override + [
            'competitions' => [
                ['id', 'slug', 'title', 'image_url', 'status', 'category', 'ticket_price', 'draw_date', 'entries_sold', 'created_at'],
                ['c-1', 'cash-draw', '£250 TAX-FREE CASH – LIVE DRAW', 'https://old.example/storage/a.png', 'ended', 'cash', '0.99', '2026-11-21 20:00:00+00', '3', '2026-10-01'],
                ['c-2', 'pop-pennies', '🎈 POP FOR PENNIES – INSTANT WIN 🎈', 'https://old.example/storage/b.png', 'ended', 'cash', '0.01', '2026-11-21 20:00:00+00', '2', '2026-10-01'],
            ],
            'draw_winners' => [
                ['id', 'competition_slug', 'competition_title', 'display_name', 'public_town', 'prize_description', 'prize_value', 'won_at', 'announced', 'winner_image_url', 'winning_ticket_number', 'draw_method', 'draw_performed_at', 'video_timestamp'],
                ['w-1', 'cash-draw', 'x', 'Abbie F.', 'Barrow-in-Furness', '£250 TAX-FREE CASH – LIVE DRAW', '250.00', '2026-11-21 20:03:41+00', 'true', '', '2', 'random', '', ''],
                ['w-2', 'cash-draw', 'x', 'Not Yet A.', 'Hidden', 'Prize', '1.00', '2026-11-21 20:05:00+00', 'false', '', '1', 'random', '', ''],
            ],
            'instant_winners' => [
                ['id', 'competition_slug', 'competition_title', 'winner_display_name', 'prize_name', 'prize_value', 'prize_type', 'winning_ticket_number', 'won_at'],
                ['i-1', 'pop-pennies', 'x', 'Jamie d.', '£0.05 Tiny Pop', '0.05', 'site_credit', '7', '2026-11-20 10:00:00+00'],
            ],
            'entry_lists' => [
                ['competition_slug', 'ticket_number', 'entry_type', 'display_name'],
                ['cash-draw', '1', 'online', 'Sam K.'], ['cash-draw', '2', 'online', 'Abbie F.'], ['cash-draw', '3', 'postal', 'Entrant'],
                ['pop-pennies', '7', 'online', 'Jamie D.'], ['pop-pennies', '9', 'online', 'Lou'],
            ],
        ];
        foreach ($files as $name => $rows) {
            $f = fopen("{$this->dir}/{$name}.csv", 'w');
            foreach ($rows as $r) {
                fputcsv($f, $r, escape: '');
            }
            fclose($f);
        }
    }

    public function test_it_imports_the_old_sites_public_record_with_masked_names(): void
    {
        $this->files();
        $this->artisan('gimme:import-archive', ['folder' => $this->dir])->assertSuccessful();

        $this->assertSame(2, ArchiveCompetition::count());
        $draw = ArchiveCompetition::query()->where('slug', 'cash-draw')->firstOrFail();
        $this->assertSame(['£250 Tax-Free Cash – Live Draw', 'draw', 99], [$draw->title, $draw->kind, $draw->price_pence]);
        $this->assertSame('Pop For Pennies – Instant Win', ArchiveCompetition::query()->where('slug', 'pop-pennies')->value('title')); // emoji gone
        $this->assertSame('instant', ArchiveCompetition::query()->where('slug', 'pop-pennies')->value('kind'));
        Storage::disk('public')->assertExists('archive/cash-draw.png');
        $this->assertSame(['Abbie F.'], ArchiveWinner::query()->where('kind', 'main')->pluck('name')->all()); // never-announced winner left out
        $this->assertSame('Jamie D.', ArchiveWinner::query()->where('kind', 'instant')->value('name')); // initial capitalised
        $this->assertSame(5, ArchiveEntry::count());

        // Same files again: nothing to do; changed files: replaced, never doubled.
        $this->artisan('gimme:import-archive', ['folder' => $this->dir])->expectsOutputToContain('already up to date')->assertSuccessful();
        $this->artisan('gimme:import-archive', ['folder' => $this->dir, '--force' => true])->assertSuccessful();
        $this->assertSame([2, 2, 5], [ArchiveCompetition::count(), ArchiveWinner::count(), ArchiveEntry::count()]);
        $this->assertNotNull(Setting::get(ImportArchive::HASH_SETTING));
    }

    public function test_a_full_name_stops_the_import_and_nothing_is_written(): void
    {
        $this->files(['entry_lists' => [
            ['competition_slug', 'ticket_number', 'entry_type', 'display_name'],
            ['cash-draw', '1', 'online', 'Sam K.'], ['cash-draw', '2', 'online', 'Samantha Jane Kelly'],
        ]]);
        $this->artisan('gimme:import-archive', ['folder' => $this->dir])->expectsOutputToContain("doesn't look masked")->assertFailed();
        $this->assertSame([0, 0, 0], [ArchiveCompetition::count(), ArchiveWinner::count(), ArchiveEntry::count()]);
    }

    public function test_a_dry_run_writes_nothing(): void
    {
        $this->files();
        $this->artisan('gimme:import-archive', ['folder' => $this->dir, '--dry-run' => true])->expectsOutputToContain('Nothing was written')->assertSuccessful();
        $this->assertSame(0, ArchiveCompetition::count());
        $this->assertNull(Setting::get(ImportArchive::HASH_SETTING));
    }

    public function test_the_api_shows_the_archive_read_only_without_ticket_counts_or_verity_links(): void
    {
        $this->files();
        $this->artisan('gimme:import-archive', ['folder' => $this->dir])->assertSuccessful();

        $this->getJson('/api/archive')->assertOk()->assertJsonCount(2, 'data')->assertJsonFragment(['slug' => 'cash-draw', 'image' => '/storage/archive/cash-draw.png']);
        $this->getJson('/api/archive/winners')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Abbie F.')->assertJsonPath('data.0.town', 'Barrow-in-Furness')
            ->assertJsonPath('data.0.ticketNumber', 2)->assertJsonPath('data.0.competitionSlug', 'cash-draw');
        $show = $this->getJson('/api/archive/cash-draw')->assertOk()->assertJsonPath('competition.type', 'draw')->assertJsonPath('hasInstantWins', false);
        $this->assertStringNotContainsString('verify', strtolower($show->getContent()));
        $this->getJson('/api/archive/pop-pennies/instant-wins')->assertOk()->assertJsonPath('data.0.prizeName', '£0.05 Tiny Pop')->assertJsonPath('hasMore', false);

        $entries = $this->getJson('/api/archive/pop-pennies/entries')->assertOk()->json();
        $this->assertSame([['ticket' => 7, 'name' => 'Jamie D.', 'source' => 'paid', 'prizeName' => '£0.05 Tiny Pop'], ['ticket' => 9, 'name' => 'Lou', 'source' => 'paid', 'prizeName' => null]], $entries['data']);
        $this->assertArrayNotHasKey('total', $entries);
        $this->getJson('/api/archive/cash-draw/entries?q=3')->assertJsonPath('data.0.source', 'postal')->assertJsonCount(1, 'data');
        $this->getJson('/api/archive/nope')->assertNotFound();
        $this->getJson('/api/competitions')->assertOk()->assertJsonMissing(['slug' => 'cash-draw']); // never mixed into the live list
    }

    public function test_no_files_means_nothing_to_do(): void
    {
        $this->artisan('gimme:import-archive', ['folder' => $this->dir])->assertFailed(); // a folder named on purpose must hold them
        $this->assertSame(0, ArchiveCompetition::count());
    }
}
