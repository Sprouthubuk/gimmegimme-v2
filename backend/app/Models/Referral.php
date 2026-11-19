<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One friend referred by one player, attached at the friend's sign-up. pending → (first paid order)
 * rewarded | capped (over the referrer's monthly cap) | blocked (fraud check) | review (flagged) |
 * missed (first order under the minimum); then rejected / clawed_back by review or a refund.
 */
class Referral extends Model
{
    protected $guarded = ['id'];

    public const QUALIFIED = ['rewarded', 'capped', 'blocked', 'review', 'rejected', 'clawed_back'];

    protected function casts(): array
    {
        return ['reasons' => 'array', 'qualified_at' => 'datetime', 'rewarded_at' => 'datetime'];
    }

    public function referrer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referrer_id');
    }

    public function friend(): BelongsTo
    {
        return $this->belongsTo(User::class, 'friend_id');
    }

    public function vouchers(): HasMany
    {
        return $this->hasMany(Voucher::class);
    }
}
