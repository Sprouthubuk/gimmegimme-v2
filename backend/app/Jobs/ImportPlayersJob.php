<?php

namespace App\Jobs;

use App\Models\AdminAction;
use App\Models\User;
use App\Support\PlayerImportRun;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Artisan;

/**
 * Runs `gimme:import-lovable` on files uploaded in Admin → Import Players, in the background, so a big
 * export can't time out a page. A check (--dry-run) writes nothing; the real import is safe to run again.
 * After a successful import the two spreadsheets are deleted: they hold every player's details.
 */
class ImportPlayersJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $timeout = 1800;

    public int $tries = 1;

    public function __construct(public string $run, public bool $dryRun, public int $adminId, public ?string $reason = null) {}

    public function handle(): void
    {
        $run = new PlayerImportRun($this->run);
        $run->write(['state' => 'running', 'dry' => $this->dryRun, 'started' => now()->toIso8601String()]);
        try {
            $exit = Artisan::call('gimme:import-lovable', ['dir' => $run->dir(), '--dry-run' => $this->dryRun]);
            $output = Artisan::output();
        } catch (\Throwable $e) {
            $exit = 1;
            $output = 'The import stopped: '.mb_substr($e->getMessage(), 0, 500);
        }
        $ok = $exit === 0;
        if ($ok && ! $this->dryRun) {
            $run->deleteSpreadsheets();
        }
        $run->write(['state' => 'done', 'ok' => $ok, 'dry' => $this->dryRun, 'output' => mb_substr($output, -20000), 'finished' => now()->toIso8601String()]);

        $admin = User::query()->find($this->adminId);
        if ($admin) {
            // Counts and outcome only: never the rows themselves.
            AdminAction::record($admin, $this->dryRun ? 'players.import_checked' : 'players.imported', $this->run, $this->reason, ['ok' => $ok] + $run->counts());
        }
    }

    public function failed(\Throwable $e): void
    {
        (new PlayerImportRun($this->run))->write(['state' => 'done', 'ok' => false, 'dry' => $this->dryRun, 'output' => 'The import stopped: '.mb_substr($e->getMessage(), 0, 500)]);
    }
}
