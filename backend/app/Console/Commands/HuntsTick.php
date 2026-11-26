<?php

namespace App\Console\Commands;

use App\Services\Hunts;
use Illuminate\Console\Command;

/** Mystery Hunts: close finds past their claim window, send the one reminder, publish the map of finished hunts. */
class HuntsTick extends Command
{
    protected $signature = 'hunts:tick';

    protected $description = 'Expire unclaimed hunt finds, send reminders and reveal finished hunt maps';

    public function handle(Hunts $hunts): int
    {
        $r = $hunts->tick();
        if (array_sum($r) > 0) {
            $this->info("Expired {$r['expired']}, reminded {$r['reminded']}, revealed {$r['revealed']}.");
        }

        return self::SUCCESS;
    }
}
