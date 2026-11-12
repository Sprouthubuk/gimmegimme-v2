<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/** Give an account admin access (admins can't play). Run on the server: php artisan gimme:make-admin you@example.com */
class MakeAdmin extends Command
{
    protected $signature = 'gimme:make-admin {email} {--first=Admin} {--last=User}';

    protected $description = 'Create or promote an admin account';

    public function handle(): int
    {
        $email = Str::lower(trim($this->argument('email')));
        $u = User::query()->where('email', $email)->first();
        if (! $u) {
            $password = $this->secret('Password for the new admin (12+ characters)');
            if (strlen((string) $password) < 12) {
                $this->error('Use at least 12 characters.');

                return self::FAILURE;
            }
            $u = new User;
            $u->forceFill(['email' => $email, 'first_name' => $this->option('first'), 'last_name' => $this->option('last'), 'password' => $password, 'email_verified_at' => now()]);
        }
        $u->forceFill(['is_admin' => true, 'is_staff' => true, 'email_verified_at' => $u->email_verified_at ?? now()])->save();
        $this->info("{$email} is an admin. Sign in at /admin.");

        return self::SUCCESS;
    }
}
