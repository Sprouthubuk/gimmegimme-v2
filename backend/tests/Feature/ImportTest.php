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

    public function test_marketing_consent_dates_come_across_and_are_never_made_up(): void
    {
        $head = ['legacy_id', 'email', 'full_name', 'marketing_email', 'marketing_email_at', 'marketing_sms', 'marketing_sms_at'];
        $this->write('players.csv', [
            $head,
            ['a1', 'amy@example.com', 'Amy Pond', 'true', '2025-03-12T10:00:00Z', 'true', '2025-04-01 08:15:00+00'],
            ['b2', 'ben@example.com', 'Ben Lee', 'true', '', 'false', ''],             // opted in, no date kept
            ['c3', 'cat@example.com', 'Cat Ray', 'false', '2025-01-01T00:00:00Z', 'false', '2025-01-01T00:00:00Z'], // opted out since
        ]);
        $this->artisan('gimme:import-lovable', ['dir' => $this->dir])->assertSuccessful();

        $amy = User::query()->where('legacy_id', 'a1')->firstOrFail();
        $this->assertSame('2025-03-12 10:00:00', $amy->marketing_email_consent_at->utc()->toDateTimeString());
        $this->assertSame('2025-04-01 08:15:00', $amy->marketing_sms_consent_at->utc()->toDateTimeString());
        $ben = User::query()->where('legacy_id', 'b2')->firstOrFail();
        $this->assertTrue($ben->marketing_email);
        $this->assertNull($ben->marketing_email_consent_at, 'a missing date stays empty, never the sign-up date or today');
        $cat = User::query()->where('legacy_id', 'c3')->firstOrFail();
        $this->assertNull($cat->marketing_email_consent_at);
        $this->assertNull($cat->marketing_sms_consent_at);

        // Amy opts out on the old site before a re-run: her dates go.
        $this->write('players.csv', [$head, ['a1', 'amy@example.com', 'Amy Pond', 'false', '2025-03-12T10:00:00Z', 'false', '']]);
        $this->artisan('gimme:import-lovable', ['dir' => $this->dir])->assertSuccessful();
        $this->assertNull($amy->refresh()->marketing_email_consent_at);
        $this->assertNull($amy->marketing_sms_consent_at);

        $this->write('players.csv', [$head, ['d4', 'dan@example.com', 'Dan Day', 'true', 'last tuesday-ish', 'false', '']]);
        $this->artisan('gimme:import-lovable', ['dir' => $this->dir])
            ->expectsOutputToContain('players.csv line 2: marketing_email_at is not a date')->assertFailed();
    }

    public function test_closed_accounts_are_left_out(): void
    {
        // The old site blanks a closed account's name and address, and may blank its email too.
        $this->write('players.csv', [
            ['legacy_id', 'email', 'full_name', 'postcode', 'closed_at'],
            ['a1', 'amy@example.com', 'Amy Pond', 'BS1 4DJ', ''],
            ['d4', 'gone@example.com', '', '', '2026-09-01T12:00:00Z'],
            ['e5', '', '', '', '2026-10-01 09:30:00+00'],
        ]);
        $this->write('balances.csv', [['legacy_id', 'deposit_pence', 'bonus_pence', 'winnings_pence'], ['a1', '100', '0', '0']]);

        $this->artisan('gimme:import-lovable', ['dir' => $this->dir, '--dry-run' => true])
            ->expectsOutputToContain('Left out 2 closed accounts')->assertSuccessful();
        $this->artisan('gimme:import-lovable', ['dir' => $this->dir])
            ->expectsOutputToContain('Left out 2 closed accounts')->expectsOutputToContain('Balances reconcile.')->assertSuccessful();
        $this->assertSame(['amy@example.com'], User::query()->pluck('email')->all());
    }

    public function test_a_closed_account_with_money_left_stops_the_import(): void
    {
        $this->write('players.csv', [
            ['legacy_id', 'email', 'full_name', 'closed_at'],
            ['a1', 'amy@example.com', 'Amy Pond', ''],
            ['d4', 'gone@example.com', '', '2026-09-01T12:00:00Z'],
        ]);
        $this->write('balances.csv', [['legacy_id', 'deposit_pence', 'bonus_pence', 'winnings_pence'], ['a1', '100', '0', '0'], ['d4', '0', '0', '250']]);

        $this->artisan('gimme:import-lovable', ['dir' => $this->dir])
            ->expectsOutputToContain('balances.csv line 3: d4 is a closed account with money in its wallet')
            ->expectsOutputToContain('Nothing was imported')->assertFailed();
        $this->assertSame(0, User::query()->count());
    }

    public function test_an_account_closed_since_an_earlier_import_is_named_for_a_person_and_left_as_it_is(): void
    {
        $this->write('players.csv', [['legacy_id', 'email', 'full_name', 'postcode', 'closed_at'], ['a1', 'amy@example.com', 'Amy Pond', 'BS1 4DJ', '']]);
        $this->artisan('gimme:import-lovable', ['dir' => $this->dir])->assertSuccessful();

        // Closed on the old site afterwards, so its details have been blanked there.
        $this->write('players.csv', [['legacy_id', 'email', 'full_name', 'postcode', 'closed_at'], ['a1', 'amy@example.com', '', '', '2026-11-01T08:00:00Z']]);
        $this->artisan('gimme:import-lovable', ['dir' => $this->dir])
            ->expectsOutputToContain('a1 (amy@example.com) was closed on the old site after an earlier import: close it in the admin')
            ->assertSuccessful();

        $amy = User::query()->where('legacy_id', 'a1')->firstOrFail();
        $this->assertNull($amy->closed_at, 'closing is an admin action with a reason, never done by the import');
        $this->assertSame(['Amy', 'Pond', 'BS1 4DJ'], [$amy->first_name, $amy->last_name, $amy->postcode], 'the blanked details are not copied over');
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
