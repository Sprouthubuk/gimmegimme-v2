<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * How many visitors pressed Accept or Reject in the cookie banner, per UK day. Totals only: nothing is kept that
 * could tell one visitor from another (no id, IP, cookie or device detail), so the count needs no consent itself.
 */
final class ConsentChoices
{
    public const CHOICES = ['accepted', 'rejected'];

    public static function record(string $choice): void
    {
        if (! in_array($choice, self::CHOICES, true)) {
            return;
        }
        $day = now('Europe/London')->toDateString();
        DB::table('consent_choices')->insertOrIgnore(['day' => $day, 'accepted' => 0, 'rejected' => 0, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('consent_choices')->where('day', $day)->update([$choice => DB::raw($choice.' + 1'), 'updated_at' => now()]);
    }

    /** @return array<string, array{accepted: int, rejected: int}> newest day first, UK days, missing days as 0 */
    public static function daily(int $days): array
    {
        $out = [];
        for ($i = 0; $i < $days; $i++) {
            $out[now('Europe/London')->subDays($i)->toDateString()] = ['accepted' => 0, 'rejected' => 0];
        }
        $rows = DB::table('consent_choices')->where('day', '>=', array_key_last($out))->get(['day', 'accepted', 'rejected']);
        foreach ($rows as $r) {
            $k = substr((string) $r->day, 0, 10);
            if (isset($out[$k])) {
                $out[$k] = ['accepted' => (int) $r->accepted, 'rejected' => (int) $r->rejected];
            }
        }

        return $out;
    }
}
