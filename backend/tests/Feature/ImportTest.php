<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\PlayCheck;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ImportTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dir = sys_get_temp_dir().'/gg-import-'.uniqid();
        mkdir($this->dir);
    }

    protected function tearDown(): void
    {
        array_map('unlink', glob($this->dir.'/*'));
        rmdir($this->dir);
        parent::tearDown();
    }

    private function write(string $name, array $rows): void
    {
        $f = fopen("{$this->dir}/{$name}", 'w');
        foreach ($rows as $r) {
            fputcsv($f, $r, escape: '');
        }
        fclose($f);
    }

    private function sample(): void
    {
        $hash = password_hash('old-password', PASSWORD_BCRYPT);
        $hash2a = '$2a$'.substr($hash, 4); // Supabase writes $2a$
        $this->write('players.csv', [
            ['legacy_id', 'email', 'full_name', 'date_of_birth', 'postcode', 'address_line1', 'marketing_email', 'email_confirmed', 'self_excluded_until', 'is_staff', 'password_hash', 'created_at', 'weekly_limit_pence'],
            ['a1', 'Amy@Example.com', 'Amy Pond', '1990-01-02', 'bs1 4dj', '1 High St', 'true', 'true', '', '', $hash2a, '2026-10-05T10:00:00Z', '5000'],
            ['b2', 'ben@example.com', 'Ben Van Lee', '', '', '', 'false', 'false', now()->addMonths(6)->toIso8601String(), '', '', '', ''],
            ['c3', 'staff@example.com', 'Sue Staff', '1985-03-04', '', '', '', 'true', '', 'true', '', '', ''],
        ]);
        $this->write('balances.csv', [
            ['legacy_id', 'deposit_pence', 'bonus_pence', 'bonus_expires_at', 'winnings_pence'],
            ['a1', '1250', '500', now()->addDays(10)->toIso8601String(), '2000'],
            ['b2', '0', '0', '', '75'],
        ]);
    }

    public function test_players_and_balances_come_across_and_reconcile(): void
    {
        $this->sample();
        $this->artisan('gimme:import-lovable', ['dir' => $this->dir])->expectsOutputToContain('Balances reconcile.')->assertSuccessful();

        $amy = User::query()->where('email', 'amy@example.com')->firstOrFail();
        $this->assertTrue(Hash::check('old-password', $amy->password), 'the old password still works');
        $this->assertSame(['deposit' => 1250, 'bonus' => 500, 'winnings' => 2000], $this->wallet()->balances($amy));
        $this->assertTrue($amy->marketing_email);
        $this->assertSame(['Amy', 'Pond'], [$amy->first_name, $amy->last_name]);
        $this->assertSame(5000, $amy->limits->weekly_deposit_pence);
        $this->assertSame('2026-10-05', $amy->created_at->toDateString());
        $this->postJson('/api/auth/login', ['email' => 'amy@example.com', 'password' => 'old-password'])->assertOk();

        $ben = User::query()->where('email', 'ben@example.com')->firstOrFail();
        $this->assertSame('Van Lee', $ben->last_name);
        $this->assertSame('self_excluded', app(PlayCheck::class)->block($ben), 'self-exclusion carries over');
        $this->assertSame('staff', app(PlayCheck::class)->block(User::query()->where('email', 'staff@example.com')->first()));

        // Running it again changes nothing.
        $this->artisan('gimme:import-lovable', ['dir' => $this->dir])->assertSuccessful();
        $this->assertSame(3, User::query()->count());
        $this->assertSame(3750, $this->wallet()->total($amy));
    }

    public function test_a_dry_run_writes_nothing_and_bad_files_import_nothing(): void
    {
        $this->sample();
        $this->artisan('gimme:import-lovable', ['dir' => $this->dir, '--dry-run' => true])->assertSuccessful();
        $this->assertSame(0, User::query()->count());

        $this->write('balances.csv', [['legacy_id', 'deposit_pence', 'bonus_pence', 'winnings_pence'], ['a1', '12.50', '0', '0'], ['zz', '1', '0', '0']]);
        $this->artisan('gimme:import-lovable', ['dir' => $this->dir])->expectsOutputToContain('Nothing was imported')->assertFailed();
        $this->assertSame(0, User::query()->count());
    }
}
