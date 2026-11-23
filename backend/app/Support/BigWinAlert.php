<?php

namespace App\Support;

use App\Filament\Support\Money;
use App\Models\BoostPrize;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\AdminAlert;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Sprouthub\Verity\Models\Winner;

/**
 * Emails the team when a player wins at or above the big-win line (Admin → Settings, default £100). Sent once per
 * win, after the payment is saved; a failure to send never stops the win being paid. Reads only.
 */
final class BigWinAlert
{
    public static function check(Winner $w, int $userId): void
    {
        self::send('big-win-alerted:'.$w->id, (int) $w->prize_value_pence, (string) $w->prize_name,
            (string) ($w->competition?->title ?? 'a competition'), $w->type === 'instant' ? 'instant win' : 'draw', $userId);
    }

    /** An added (prize boost) instant win: App\Services\PrizeBoosts. */
    public static function checkBoost(BoostPrize $p, int $userId): void
    {
        self::send('big-win-alerted:boost:'.$p->id, (int) $p->value_pence, (string) $p->name,
            (string) ($p->competition?->title ?? 'a competition'), 'instant win (prize boost)', $userId);
    }

    private static function send(string $key, int $value, string $prize, string $title, string $kind, int $userId): void
    {
        if ($value < Reports::bigWinPence()) {
            return;
        }
        DB::afterCommit(function () use ($key, $value, $prize, $title, $kind, $userId) {
            if (! Cache::add($key, 1, now()->addDays(60))) {
                return; // already sent
            }
            $u = User::query()->find($userId);
            $to = array_values(array_filter(array_map('trim', explode(',', (string) Setting::get('big_win_alert_emails')))));
            AdminAlert::send('Big Win: '.Money::show($value).' · '.$prize, [
                ($u ? trim($u->first_name.' '.$u->last_name).' ('.$u->email.')' : 'A player').' has just won '.$prize.' ('.Money::show($value).')',
                'Competition: '.$title.' · '.$kind,
                'Won at '.now('Europe/London')->format('j M Y, H:i').' (UK time)',
            ], $u ? '/admin/users/'.$u->id : '/admin/wins-report', $to ?: null);
        });
    }
}
