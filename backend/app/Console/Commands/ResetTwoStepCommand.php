<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

/** For an admin who has lost their phone and their recovery codes: they set up two-step sign-in again at their next sign-in. */
class ResetTwoStepCommand extends Command
{
    protected $signature = 'gimme:reset-two-step {email : The admin\'s sign-in email}';

    protected $description = 'Clear an admin\'s two-step sign-in so they set it up again';

    public function handle(): int
    {
        $u = User::query()->where('email', strtolower(trim((string) $this->argument('email'))))->first();
        if (! $u) {
            $this->error('No account with that email.');

            return self::FAILURE;
        }
        $u->saveAppAuthenticationSecret(null);
        $u->saveAppAuthenticationRecoveryCodes(null);
        $this->info("Two-step sign-in cleared for {$u->email}: they'll set it up again when they next sign in to /admin.");

        return self::SUCCESS;
    }
}
