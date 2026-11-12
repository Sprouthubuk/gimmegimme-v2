<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PromoCode extends Model
{
    public const MAX_PERCENT = 50;

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'active' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::saving(function (PromoCode $p) {
            if ($p->percent_off < 1 || $p->percent_off > self::MAX_PERCENT) {
                throw new \DomainException('A promo code takes between 1% and '.self::MAX_PERCENT.'% off.');
            }
            $p->code = strtoupper(trim($p->code));
        });
    }

    protected $table = 'promo_codes';

    protected $guarded = ['id'];
}
