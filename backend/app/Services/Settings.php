<?php

namespace App\Services;

use App\Models\Setting;

/** Typed access to the settings the money rules depend on. */
final class Settings
{
    public static function salesOpen(): bool
    {
        return Setting::bool('sales_open');
    }

    public static function minDeposit(): int
    {
        return max(100, Setting::int('min_deposit_pence'));
    }

    public static function minCard(): int
    {
        return max(100, Setting::int('min_card_pence'));
    }

    public static function minWithdrawal(): int
    {
        return max(100, Setting::int('min_withdrawal_pence'));
    }

    public static function maxTopUp(): int
    {
        return max(self::minDeposit(), Setting::int('max_top_up_pence'));
    }


    public static function bonusExpiryDays(): int
    {
        return max(1, Setting::int('bonus_expiry_days'));
    }

    public static function gimmeBoxOn(): bool
    {
        return Setting::bool('feature_gimme_box');
    }

    public static function referralsOn(): bool
    {
        return Setting::bool('feature_referrals');
    }

    /** A whole-number setting kept within [$min, $max]. */
    public static function bounded(string $key, int $min, int $max): int
    {
        return max($min, min($max, Setting::int($key)));
    }

    /** @return list<int> the Gimme Box budget chips in pence, within the slider's range */
    public static function gimmeBoxChips(): array
    {
        [$lo, $hi] = [self::bounded('gimme_box_min_pence', 100, 100000), self::bounded('gimme_box_max_pence', 100, 100000)];

        return array_values(array_filter(array_map('intval', explode(',', (string) Setting::get('gimme_box_chips'))), fn ($p) => $p >= $lo && $p <= $hi));
    }
}
