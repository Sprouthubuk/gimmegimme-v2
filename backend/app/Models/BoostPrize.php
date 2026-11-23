<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One added instant prize on its own winning ticket number (App\Services\PrizeBoosts). */
class BoostPrize extends Model
{
    protected $guarded = ['id'];

    protected $casts = ['added_at' => 'datetime', 'won_at' => 'datetime', 'value_pence' => 'integer', 'ticket_number' => 'integer', 'slot' => 'integer'];

    public function boost(): BelongsTo
    {
        return $this->belongsTo(PrizeBoost::class, 'prize_boost_id');
    }

    public function competition(): BelongsTo
    {
        return $this->belongsTo(Competition::class);
    }

    public function winner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'won_user_id');
    }
}
