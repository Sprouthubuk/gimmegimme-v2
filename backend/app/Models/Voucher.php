<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Free tickets the player chooses a live draw for (a referral reward). available → redeemed | expired | clawed_back. */
class Voucher extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'redeemed_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function referral(): BelongsTo
    {
        return $this->belongsTo(Referral::class);
    }

    public function competition(): BelongsTo
    {
        return $this->belongsTo(Competition::class);
    }
}
