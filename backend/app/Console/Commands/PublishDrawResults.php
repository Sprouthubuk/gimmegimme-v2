<?php

namespace App\Console\Commands;

use App\Services\DrawResults;
use Illuminate\Console\Command;

/** The safety net for held draw results: publishes any held longer than DrawResults::HOLD_MAX_MINUTES. */
class PublishDrawResults extends Command
{
    protected $signature = 'competitions:publish-draw-results';

    protected $description = 'Publish draw results held longer than the maximum hold (the safety net)';

    public function handle(DrawResults $results): int
    {
        $n = $results->publishDue();
        if ($n > 0) {
            $this->info("{$n} published.");
        }

        return self::SUCCESS;
    }
}
