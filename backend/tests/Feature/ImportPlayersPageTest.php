<?php

namespace Tests\Feature;

use App\Filament\Pages\ImportPlayers;
use App\Models\AdminAction;
use App\Models\LedgerEntry;
use App\Models\User;
use App\Support\PlayerImportRun;
use Filament\Facades\Filament;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;
use Tests\TestCase;

/** Admin → Import Players: upload the two Lovable exports, check them, then import, all from the admin. */
class ImportPlayersPageTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->actingAs($this->admin());
        Filament::setCurrentPanel('admin');
    }

    private function csv(string $name, array $rows): UploadedFile
    {
        $f = fopen('php://temp', 'w+');
        foreach ($rows as $r) {
            fputcsv($f, $r, escape: '');
        }
        rewind($f);

        return UploadedFile::fake()->createWithContent($name, stream_get_contents($f));
    }

    private function players(string $email = 'amy@example.com'): UploadedFile
    {
        return $this->csv('players.csv', [
            ['legacy_id', 'email', 'full_name', 'date_of_birth', 'email_confirmed', 'password_hash'],
            ['a1', $email, 'Amy Pond', '1990-01-02', 'true', password_hash('old-password', PASSWORD_BCRYPT)],
            ['b2', 'ben@example.com', 'Ben Lee', '1991-02-03', 'true', ''],
        ]);
    }

    private function balances(): UploadedFile
    {
        return $this->csv('balances.csv', [
            ['legacy_id', 'deposit_pence', 'bonus_pence', 'bonus_expires_at', 'winnings_pence'],
            ['a1', '1250', '0', '', '2000'],
        ]);
    }

    public function test_check_writes_nothing_then_import_brings_players_and_balances_and_deletes_the_files(): void
    {
        $page = Livewire::test(ImportPlayers::class)->assertOk()
            ->set('data.players', [$this->players()])->set('data.balances', [$this->balances()])
            ->callAction('check')->assertHasNoActionErrors();

        // The check ran (queue is sync in tests), changed nothing, and offers the import.
        $run = PlayerImportRun::current();
        $this->assertNotNull($run);
        $this->assertTrue($run->status()['ok']);
        $this->assertTrue($run->status()['dry']);
        $this->assertSame(0, User::query()->where('email', 'amy@example.com')->count());
        $this->assertSame(['players' => 2, 'balances' => 1], $run->counts());
        $page->assertActionVisible('import');

        // The import needs IMPORT typed, then brings the players and money across.
        Livewire::test(ImportPlayers::class)->assertSeeHtml("mountAction('import')")->callAction('import', ['reason' => 'Switch-over', 'confirm' => 'nope'])->assertHasActionErrors(['confirm']);
        $this->assertSame(0, User::query()->where('email', 'amy@example.com')->count());
        Livewire::test(ImportPlayers::class)->callAction('import', ['reason' => 'Switch-over', 'confirm' => 'IMPORT'])->assertHasNoActionErrors()
            ->assertSee('Import finished and the files were deleted from the server.');

        $amy = User::query()->where('email', 'amy@example.com')->firstOrFail();
        $this->assertSame(3250, (int) LedgerEntry::query()->where('user_id', $amy->id)->where('direction', 'credit')->sum('amount_pence'));
        $status = $run->status();
        $this->assertTrue($status['ok']);
        $this->assertFalse($status['dry']);
        // The spreadsheets (every player's details) don't stay on the server.
        $this->assertFalse($run->has('players.csv'));
        $this->assertFalse($run->has('balances.csv'));
        $this->assertSame([], Storage::disk('local')->files('imports/incoming'));
        // Recorded with counts only, never the rows.
        $done = AdminAction::query()->where('action', 'players.imported')->firstOrFail();
        $this->assertSame('Switch-over', $done->reason);
        $this->assertStringNotContainsString('amy@', json_encode($done->detail));
    }

    public function test_a_file_that_fails_the_check_is_never_offered_for_import(): void
    {
        Livewire::test(ImportPlayers::class)
            ->set('data.players', [$this->players('not-an-email')])
            ->callAction('check')
            ->assertActionHidden('import')
            ->assertSee('The check found problems');
        Livewire::test(ImportPlayers::class)->assertDontSeeHtml("mountAction('import')")->assertSeeHtml("mountAction('remove')");
        $this->assertFalse(PlayerImportRun::current()->status()['ok']);
        $this->assertSame(0, User::query()->where('email', 'ben@example.com')->count());
    }

    public function test_the_import_is_refused_without_a_passing_check_of_the_same_files(): void
    {
        // Nothing uploaded yet: the page shows only the check button.
        Livewire::test(ImportPlayers::class)->assertActionHidden('import')
            ->assertSeeHtml("mountAction('check')")->assertDontSeeHtml("mountAction('import')")->assertDontSeeHtml("mountAction('remove')");
        $this->assertNull(PlayerImportRun::current());
    }

    public function test_uploaded_files_can_be_deleted_and_old_ones_are_removed_by_housekeeping(): void
    {
        $page = Livewire::test(ImportPlayers::class)->set('data.players', [$this->players()])->callAction('check');
        $run = PlayerImportRun::current();
        $page->callAction('remove');
        $this->assertNull(PlayerImportRun::current());
        $this->assertFalse(Storage::disk('local')->exists($run->path()));

        $old = PlayerImportRun::start();
        Storage::disk('local')->put($old->path('players.csv'), 'legacy_id,email');
        touch(Storage::disk('local')->path($old->path('players.csv')), now()->subDays(2)->getTimestamp());
        $fresh = PlayerImportRun::start();
        Storage::disk('local')->put($fresh->path('players.csv'), 'legacy_id,email');
        $this->assertSame(1, PlayerImportRun::removeOld());
        $this->assertFalse(Storage::disk('local')->exists($old->path()));
        $this->assertTrue(Storage::disk('local')->exists($fresh->path()));
    }

    public function test_players_cannot_open_the_page(): void
    {
        $this->actingAs($this->player());
        $this->get(ImportPlayers::getUrl())->assertForbidden();
    }
}
