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
        'credit_card_monthly_cap_pence' => '25000',
        'signup_bonus_enabled' => '0',
        'signup_bonus_cap_pence' => '2000',
        'signup_bonus_max_grants' => '100', // first 100 players only
        'bonus_expiry_days' => '30',
        'featured_slug' => null,
        'instagram_url' => null,
        'facebook_url' => null,
        'support_email' => null,
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
