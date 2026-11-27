<?php

namespace App\Support;

use App\Models\MetaEvent;
use App\Models\Order;
use App\Tracking\MetaEvents;
use Illuminate\Support\Carbon;

/**
 * Lines up the site's sales against what Meta was told, per UK day, so the admin can see why Ads Manager differs:
 * buyers who didn't accept marketing cookies are never sent (the law), and some sends wait, fail or expire.
 *
 * "Paid with real money" is every paid ticket order with a value above £0 once bonus credit is taken off
 * (the same `MetaEvents::realMoneyPence` both the server and the browser send). Read only.
 */
final class MetaTrackingReport
{
    /**
     * @return array<string, array{orders: int, value: int, card: int, winningsSpent: int, consented: int, sent: int, sentValue: int, waiting: int, notSent: int}>
     *                                                                                                                                                             newest day first
     */
    public static function daily(int $days): array
    {
        $out = [];
        for ($i = 0; $i < $days; $i++) {
            $out[now('Europe/London')->subDays($i)->format('Y-m-d')] = ['orders' => 0, 'value' => 0, 'card' => 0, 'winningsSpent' => 0, 'consented' => 0, 'sent' => 0, 'sentValue' => 0, 'waiting' => 0, 'notSent' => 0];
        }
        $from = now('Europe/London')->startOfDay()->subDays($days - 1)->utc();

        $orders = Order::query()->where('order_type', 'tickets')->where('status', 'paid')->where('paid_at', '>=', $from)
            ->get(['id', 'number', 'paid_at', 'total_pence', 'card_pence', 'paid_bonus_pence', 'paid_winnings_pence']);
        $events = MetaEvent::query()->where('event_name', 'Purchase')->whereIn('order_id', $orders->pluck('id'))
            ->get(['order_id', 'status'])->keyBy('order_id');

        foreach ($orders as $o) {
            $value = MetaEvents::realMoneyPence($o);
            $k = Carbon::parse($o->paid_at)->setTimezone('Europe/London')->format('Y-m-d');
            if ($value <= 0 || ! isset($out[$k])) {
                continue;
            }
            $row = &$out[$k];
            $row['orders']++;
            $row['value'] += $value;
            $row['card'] += (int) $o->card_pence;
            $row['winningsSpent'] += (int) $o->paid_winnings_pence;
            $e = $events->get($o->id);
            if ($e) {
                $row['consented']++;
                match ($e->status) {
                    'sent' => [$row['sent']++, $row['sentValue'] += $value],
                    'waiting', 'ready', 'failed' => $row['waiting']++,
                    default => $row['notSent']++,
                };
            }
            unset($row);
        }

        return $out;
    }

    /** Why recent sends didn't go through: Meta's error type and code only, with how many. @return array<string, int> */
    public static function recentErrors(int $days = 7): array
    {
        return MetaEvent::query()->whereNotNull('last_error')->where('updated_at', '>=', now()->subDays($days))
            ->whereIn('status', ['failed', 'expired'])->selectRaw('last_error, count(*) as n')->groupBy('last_error')
            ->orderByDesc('n')->limit(5)->pluck('n', 'last_error')->map(fn ($n) => (int) $n)->all();
    }
}
