<?php

namespace App\Filament\Support;

use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Carbon;

/** Per-day totals for the dashboard, by UK day. Small sums done in PHP so they work on any database. */
final class Daily
{
    /** @return array<string,int> date (Y-m-d, UK) => pence of paid orders of this type, oldest first. */
    public static function takings(int $days, string $type = 'tickets'): array
    {
        $out = self::empty($days);
        Order::query()->where('status', 'paid')->where('order_type', $type)->where('paid_at', '>=', self::from($days))
            ->get(['paid_at', 'total_pence'])
            ->each(function (Order $o) use (&$out) {
                $k = $o->paid_at->copy()->setTimezone('Europe/London')->format('Y-m-d');
                if (isset($out[$k])) {
                    $out[$k] += (int) $o->total_pence;
                }
            });

        return $out;
    }

    /** @return array<string,int> date => new player accounts. */
    public static function signUps(int $days): array
    {
        $out = self::empty($days);
        User::query()->where('is_staff', false)->where('created_at', '>=', self::from($days))->get(['created_at'])
            ->each(function (User $u) use (&$out) {
                $k = $u->created_at->copy()->setTimezone('Europe/London')->format('Y-m-d');
                if (isset($out[$k])) {
                    $out[$k]++;
                }
            });

        return $out;
    }

    private static function from(int $days): Carbon
    {
        return now('Europe/London')->startOfDay()->subDays($days - 1)->utc();
    }

    private static function empty(int $days): array
    {
        $out = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $out[now('Europe/London')->subDays($i)->format('Y-m-d')] = 0;
        }

        return $out;
    }
}
