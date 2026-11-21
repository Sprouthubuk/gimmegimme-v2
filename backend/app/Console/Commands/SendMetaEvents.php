<?php

namespace App\Console\Commands;

use App\Tracking\MetaEvents;
use Illuminate\Console\Command;

class SendMetaEvents extends Command
{
    protected $signature = 'gimme:meta-events';

    protected $description = 'Send paid orders, top ups and sign-ups to Meta (Conversions API), for visitors who accepted marketing cookies.';

    public function handle(MetaEvents $events): int
    {
        $n = $events->sendDue();
        if ($n > 0) {
            $this->info("Sent {$n} event(s) to Meta.");
        }

        return self::SUCCESS;
    }
}
