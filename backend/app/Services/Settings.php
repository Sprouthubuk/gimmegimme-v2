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

    public static function creditCardMonthlyCap(): int
    {
        return Setting::int('credit_card_monthly_cap_pence');
    }

    public static function bonusExpiryDays(): int
    {
        return max(1, Setting::int('bonus_expiry_days'));
    }
}
