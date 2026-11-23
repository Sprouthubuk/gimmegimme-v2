<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** The audit record of one competition's prize boost (App\Services\PrizeBoosts). Never changed or deleted. */
class PrizeBoost extends Model
{
    protected $guarded = ['id'];

    protected $casts = ['added_at' => 'datetime', 'beacon_round' => 'integer', 'value_pence' => 'integer', 'prize_count' => 'integer'];

    public function competition(): BelongsTo
    {
        return $this->belongsTo(Competition::class);
    }

    public function prizes(): HasMany
    {
        return $this->hasMany(BoostPrize::class)->orderBy('slot');
    }
}
