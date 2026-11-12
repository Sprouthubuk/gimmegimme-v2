<?php

namespace App\Console\Commands;

use App\Models\LedgerEntry;
use App\Models\SpendLimit;
use App\Services\Wallet;
use Illuminate\Console\Command;

/** Apply limit raises whose 24 hours are up, and write off expired bonus credit. */
class DailyHousekeeping extends Command
{
    protected $signature = 'players:housekeeping';

    protected $description = 'Apply waiting limit changes and expire bonus credit';

    public function handle(Wallet $wallet): int
    {
        $applied = 0;
        SpendLimit::query()->whereNotNull('pending_applies_at')->where('pending_applies_at', '<=', now())->get()->each(function (SpendLimit $l) use (&$applied) {
            $l->forceFill([
                'weekly_deposit_pence' => $l->pending_remove ? null : $l->pending_weekly_deposit_pence,
                'pending_weekly_deposit_pence' => null, 'pending_remove' => false, 'pending_applies_at' => null,
            ])->save();
            $applied++;
        });
        $expired = 0;
        LedgerEntry::query()->where('bucket', 'bonus')->where('direction', 'credit')->where('expires_at', '<=', now())
            ->distinct()->pluck('user_id')->each(function ($id) use ($wallet, &$expired) {
                $expired += $wallet->expireBonus($id);
            });
        $this->info("limits applied {$applied}, bonus expired {$expired}p");

        return self::SUCCESS;
    }
}
