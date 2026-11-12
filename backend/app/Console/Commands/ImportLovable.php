<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Wallet;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Bring players across from the Lovable site. Reads two CSV files from the export folder
 * (format in docs/lovable-import.md):
 *
 *   players.csv   one row per account (legacy_id, email, names, date_of_birth, address, marketing,
 *                 safer-play dates, flags, and the bcrypt password_hash so existing passwords keep working)
 *   balances.csv  legacy_id, deposit_pence, bonus_pence, bonus_expires_at, winnings_pence
 *
 * Safe to run again: players are matched on legacy_id and balances are written once each
 * (reference import:{legacy_id}:{bucket}). --dry-run checks everything and writes nothing.
 * Ends with a reconciliation: the totals read must equal the totals now in the wallet.
 */
class ImportLovable extends Command
{
    protected $signature = 'gimme:import-lovable {dir : Folder holding players.csv and balances.csv} {--dry-run}';

    protected $description = 'Import players and wallet balances exported from the Lovable site';

    public function handle(Wallet $wallet): int
    {
        $dir = rtrim($this->argument('dir'), '/');
        $players = $this->read("{$dir}/players.csv", ['legacy_id', 'email']);
        $balances = is_file("{$dir}/balances.csv") ? $this->read("{$dir}/balances.csv", ['legacy_id', 'deposit_pence', 'bonus_pence', 'winnings_pence']) : [];
        if ($players === null || $balances === null) {
            return self::FAILURE;
        }

        $problems = [];
        $seenEmails = [];
        foreach ($players as $i => &$p) {
            // The old site kept one full_name; split it at the first space.
            if (($p['first_name'] ?? '') === '' && ($p['full_name'] ?? '') !== '') {
                [$p['first_name'], $p['last_name']] = array_pad(preg_split('/\s+/', trim($p['full_name']), 2), 2, '');
            }
            $p += ['first_name' => '', 'last_name' => ''];
        }
        unset($p);
        foreach ($players as $i => $p) {
            $line = $i + 2;
            $email = Str::lower(trim($p['email']));
            if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $problems[] = "players.csv line {$line}: not an email address";
            }
            if (isset($seenEmails[$email])) {
                $problems[] = "players.csv line {$line}: {$email} appears twice";
            }
            $seenEmails[$email] = true;
            if (($p['password_hash'] ?? '') !== '' && ! preg_match('/^\$2[aby]\$\d\d\$[.\/A-Za-z0-9]{53}$/', $p['password_hash'])) {
                $problems[] = "players.csv line {$line}: password_hash is not a bcrypt hash";
            }
            foreach (['date_of_birth', 'self_excluded_until', 'cool_off_until', 'created_at'] as $d) {
                if (($p[$d] ?? '') !== '' && strtotime($p[$d]) === false) {
                    $problems[] = "players.csv line {$line}: {$d} is not a date";
                }
            }
        }
        $known = array_flip(array_column($players, 'legacy_id'));
        $want = ['deposit' => 0, 'bonus' => 0, 'winnings' => 0];
        foreach ($balances as $i => $b) {
            $line = $i + 2;
            if (! isset($known[$b['legacy_id']])) {
                $problems[] = "balances.csv line {$line}: no player {$b['legacy_id']}";
            }
            foreach (['deposit', 'bonus', 'winnings'] as $k) {
                if (! preg_match('/^\d+$/', (string) $b["{$k}_pence"])) {
                    $problems[] = "balances.csv line {$line}: {$k}_pence must be whole pence";
                } else {
                    $want[$k] += (int) $b["{$k}_pence"];
                }
            }
        }
        if ($problems) {
            foreach (array_slice($problems, 0, 50) as $p) {
                $this->error($p);
            }
            $this->error(count($problems).' problem(s). Nothing was imported.');

            return self::FAILURE;
        }
        $this->info(count($players).' players, balances: deposit £'.number_format($want['deposit'] / 100, 2)
            .', bonus £'.number_format($want['bonus'] / 100, 2).', winnings £'.number_format($want['winnings'] / 100, 2));
        if ($this->option('dry-run')) {
            $this->info('Dry run: nothing written.');

            return self::SUCCESS;
        }

        $created = $updated = 0;
        DB::transaction(function () use ($players, $balances, $wallet, &$created, &$updated) {
            $ids = [];
            foreach ($players as $p) {
                $u = User::query()->where('legacy_id', $p['legacy_id'])->first()
                    ?? User::query()->where('email', Str::lower(trim($p['email'])))->whereNull('legacy_id')->first();
                $fresh = ! $u;
                $u ??= new User;
                $fields = [
                    'legacy_id' => $p['legacy_id'], 'email' => Str::lower(trim($p['email'])),
                    'first_name' => mb_substr(trim($p['first_name']) ?: 'Player', 0, 60), 'last_name' => mb_substr(trim($p['last_name']), 0, 60),
                    'date_of_birth' => self::date($p['date_of_birth'] ?? ''), 'phone' => self::text($p['phone'] ?? '', 30),
                    'address_line1' => self::text($p['address_line1'] ?? '', 120), 'address_line2' => self::text($p['address_line2'] ?? '', 120),
                    'city' => self::text($p['city'] ?? '', 80), 'postcode' => self::text(strtoupper($p['postcode'] ?? ''), 12),
                    'marketing_email' => self::bool($p['marketing_email'] ?? ''), 'marketing_sms' => self::bool($p['marketing_sms'] ?? ''),
                    'email_verified_at' => self::bool($p['email_confirmed'] ?? '') ? ($u->email_verified_at ?? now()) : null,
                    'self_excluded_until' => self::date($p['self_excluded_until'] ?? ''), 'cool_off_until' => self::date($p['cool_off_until'] ?? ''),
                    'is_staff' => self::bool($p['is_staff'] ?? '') || self::bool($p['is_admin'] ?? ''),
                    'on_hold_at' => self::bool($p['on_hold'] ?? '') ? ($u->on_hold_at ?? now()) : $u->on_hold_at,
                    'on_hold_reason' => self::bool($p['on_hold'] ?? '') ? 'Carried over from the previous site' : $u->on_hold_reason,
                    'id_verified_at' => self::bool($p['id_verified'] ?? '') ? ($u->id_verified_at ?? now()) : $u->id_verified_at,
                ];
                // Safer-play dates only ever get longer, never shorter, on a re-run.
                foreach (['self_excluded_until', 'cool_off_until'] as $k) {
                    if ($u->{$k} && (! $fields[$k] || $u->{$k}->gt($fields[$k]))) {
                        $fields[$k] = $u->{$k};
                    }
                }
                if ($fresh) {
                    $fields['password'] = ($p['password_hash'] ?? '') !== '' ? null : Str::random(40);
                    $fields['created_at'] = self::date($p['created_at'] ?? '') ?? now();
                }
                $u->forceFill($fields);
                if ($fresh && ($p['password_hash'] ?? '') !== '') {
                    // Existing passwords keep working: the bcrypt hash is stored, not hashed again. Supabase writes
                    // $2a$ (Go's bcrypt, which has no $2a$ flaw); PHP only accepts the $2y$ label for the same hash.
                    $u->setRawAttributes(['password' => preg_replace('/^\$2[ab]\$/', '\$2y\$', $p['password_hash'])] + $u->getAttributes());
                }
                $u->save();
                if (preg_match('/^\d+$/', (string) ($p['weekly_limit_pence'] ?? ''))) {
                    $l = $u->limits()->firstOrCreate([]);
                    $new = (int) $p['weekly_limit_pence'];
                    // A limit only ever comes across lower, never higher, than one already set here.
                    if ($l->weekly_deposit_pence === null || $new < $l->weekly_deposit_pence) {
                        $l->forceFill(['weekly_deposit_pence' => $new])->save();
                    }
                }
                $fresh ? $created++ : $updated++;
                $ids[$p['legacy_id']] = $u->id;
            }
            foreach ($balances as $b) {
                foreach (['deposit', 'bonus', 'winnings'] as $k) {
                    $pence = (int) $b["{$k}_pence"];
                    if ($pence > 0) {
                        $expires = $k === 'bonus' ? (self::date($b['bonus_expires_at'] ?? '') ?? now()->addDays(30)) : null;
                        $wallet->credit($ids[$b['legacy_id']], $k, $pence, 'Balance from the previous site', "import:{$b['legacy_id']}:{$k}", null, $expires);
                    }
                }
            }
        });

        $have = DB::table('wallet_ledger')->where('reference', 'like', 'import:%')->selectRaw('bucket, SUM(amount_pence) AS t')->groupBy('bucket')->pluck('t', 'bucket');
        $ok = true;
        foreach ($want as $k => $v) {
            if ((int) ($have[$k] ?? 0) !== $v) {
                $this->error("Reconciliation: {$k} read £".number_format($v / 100, 2).', imported £'.number_format(((int) ($have[$k] ?? 0)) / 100, 2));
                $ok = false;
            }
        }
        $this->info("Created {$created}, updated {$updated}. ".($ok ? 'Balances reconcile.' : 'Balances DO NOT reconcile.'));

        return $ok ? self::SUCCESS : self::FAILURE;
    }

    /** @return list<array<string, string>>|null */
    private function read(string $path, array $required): ?array
    {
        if (! is_file($path)) {
            $this->error("Missing {$path}");

            return null;
        }
        $f = fopen($path, 'r');
        $head = fgetcsv($f, escape: '');
        $head = array_map(fn ($h) => strtolower(trim(preg_replace('/^\xEF\xBB\xBF/', '', (string) $h))), $head ?: []);
        if ($missing = array_diff($required, $head)) {
            $this->error(basename($path).' is missing columns: '.implode(', ', $missing));

            return null;
        }
        $rows = [];
        while (($r = fgetcsv($f, escape: '')) !== false) {
            if ($r === [null]) {
                continue;
            }
            $rows[] = array_combine($head, array_pad(array_map('trim', $r), count($head), ''));
        }
        fclose($f);

        return $rows;
    }

    private static function date(string $v): ?Carbon
    {
        return trim($v) === '' ? null : Carbon::parse($v);
    }

    private static function text(string $v, int $max): ?string
    {
        $v = trim($v);

        return $v === '' ? null : mb_substr($v, 0, $max);
    }

    private static function bool(string $v): bool
    {
        return in_array(strtolower(trim($v)), ['1', 'true', 't', 'yes', 'y'], true);
    }
}
