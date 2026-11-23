<?php

namespace App\Support;

use App\Filament\Support\Money;
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
        $value = (int) $w->prize_value_pence;
        if ($value < Reports::bigWinPence()) {
            return;
        }
        DB::afterCommit(function () use ($w, $userId, $value) {
            if (! Cache::add('big-win-alerted:'.$w->id, 1, now()->addDays(60))) {
                return; // already sent
            }
            $u = User::query()->find($userId);
            $title = (string) ($w->competition?->title ?? 'a competition');
            $prize = PrizeNames::forWinner($w);
            $to = array_values(array_filter(array_map('trim', explode(',', (string) Setting::get('big_win_alert_emails')))));
            AdminAlert::send('Big Win: '.Money::show($value).' · '.$prize, [
                ($u ? trim($u->first_name.' '.$u->last_name).' ('.$u->email.')' : 'A player').' has just won '.$prize.' ('.Money::show($value).')',
                'Competition: '.$title.' · '.($w->type === 'instant' ? 'instant win' : 'draw'),
                'Won at '.now('Europe/London')->format('j M Y, H:i').' (UK time)',
            ], $u ? '/admin/users/'.$u->id : '/admin/wins-report', $to ?: null);
        });
    }
}
