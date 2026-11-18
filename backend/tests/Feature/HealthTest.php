<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Sprouthub\Verity\Console\ProcessDueCommand;
use Tests\TestCase;

/** The uptime monitor's page: green only while the database answers and the scheduler is running. */
class HealthTest extends TestCase
{
    public function test_healthy_when_the_scheduler_ran_recently(): void
    {
        Cache::forever(ProcessDueCommand::HEARTBEAT, now()->subMinutes(2)->getTimestamp());
        $this->getJson('/api/health')->assertOk()->assertExactJson(['status' => 'ok', 'checks' => ['database' => 'ok', 'scheduler' => 'ok']]);
    }

    public function test_failing_when_the_scheduler_has_stopped(): void
    {
        Cache::forget(ProcessDueCommand::HEARTBEAT);
        $this->getJson('/api/health')->assertStatus(503)->assertJsonPath('checks.scheduler', 'failing');
        Cache::forever(ProcessDueCommand::HEARTBEAT, now()->subMinutes(6)->getTimestamp());
        $this->getJson('/api/health')->assertStatus(503)->assertJsonPath('status', 'failing');
        // Running the scheduler's job puts it right.
        $this->artisan('verity:process-due')->assertSuccessful();
        $this->getJson('/api/health')->assertOk();
    }
}
