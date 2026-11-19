<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/** Site settings an admin can change. Read through Settings::get so every page agrees. */
class Setting extends Model
{
    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    /** Defaults: the safe value when a setting has never been saved. Sales start switched off. */
    public const DEFAULTS = [
        'sales_open' => '0',
        'min_deposit_pence' => '500',
        'min_card_pence' => '100',
        'min_withdrawal_pence' => '2000',
        'max_top_up_pence' => '50000',
        'bonus_expiry_days' => '30',
        'featured_slug' => null,
        'instagram_url' => null,
        'facebook_url' => null,
        'support_email' => null,
        // Gimme Box (off until switched on in Admin → Settings)
        'feature_gimme_box' => '0',
        'gimme_box_chips' => '500,1000,2000,5000',
        'gimme_box_min_pence' => '500',
        'gimme_box_max_pence' => '10000',
        'gimme_box_bonus_pct' => '10',
        'gimme_box_max_sold_pct' => '95',
        'gimme_box_slow_boost_pct' => '150',
        'gimme_box_min_draws' => '2',
        'gimme_box_max_draws' => '4',
        'gimme_box_hold_minutes' => '10',
        'gimme_box_share_of_sales_pct' => '30',
        // Refer a Friend (off until switched on)
        'feature_referrals' => '0',
        'referral_reward_type' => 'tickets',
        'referral_reward_tickets' => '10',
        'referral_reward_credit_pence' => '200',
        'referral_min_purchase_pence' => '500',
        'referral_monthly_cap' => '10',
        'referral_voucher_days' => '30',
        'referral_clawback_days' => '14',
        'referral_flag_after' => '3',
    ];

    public static function get(string $key): ?string
    {
        $all = Cache::remember('settings:all', 30, fn () => static::query()->pluck('value', 'key')->all());

        return array_key_exists($key, $all) ? $all[$key] : (self::DEFAULTS[$key] ?? null);
    }

    public static function int(string $key): int
    {
        return (int) static::get($key);
    }

    public static function bool(string $key): bool
    {
        return static::get($key) === '1';
    }

    public static function put(string $key, ?string $value): void
    {
        static::query()->updateOrCreate(['key' => $key], ['value' => $value]);
        Cache::forget('settings:all');
    }
}
