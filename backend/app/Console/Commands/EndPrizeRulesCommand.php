<?php

namespace App\Console\Commands;

use App\Services\EndPrizeRules;
use Illuminate\Console\Command;

/** Every minute: schedule the redraw for any end prize won twice by one person (EndPrizeRules). */
class EndPrizeRulesCommand extends Command
{
    protected $signature = 'gimme:end-prize-rules';

    protected $description = 'Redraw end prizes won twice by the same person';

    public function handle(EndPrizeRules $rules): int
    {
        $n = $rules->enforceAll();
        if ($n) {
            $this->info("Checked {$n} competition(s) with a repeat end-prize win.");
        }

        return self::SUCCESS;
    }
}
