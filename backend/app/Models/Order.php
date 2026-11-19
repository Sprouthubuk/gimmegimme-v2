<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    use HasUlids;

    public const UNPAID = ['created', 'pending_payment'];

    /** How long an unpaid order holds its tickets while the player is at the payment page. */
    public const HOLD_MINUTES = 15;

    public const CLOSED = ['failed', 'cancelled', 'expired'];

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'needs_attention' => 'boolean',
            'paid_at' => 'datetime',
            'closed_at' => 'datetime',
            'fulfilled_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // A refunded ticket order may have qualified a referral: take back what it unlocked (Referrals::orderReversed).
        static::updated(function (Order $o) {
            if ($o->wasChanged('status') && $o->status === 'refunded' && $o->order_type === 'tickets') {
                app(\App\Services\Referrals::class)->orderReversed($o);
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(OrderLine::class);
    }

    public function isDeposit(): bool
    {
        return $this->order_type === 'deposit';
    }

    public static function newNumber(string $prefix): string
    {
        do {
            $n = $prefix.'-'.strtoupper(substr(str_replace(['0', 'O', '1', 'I'], '', bin2hex(random_bytes(8))), 0, 8));
        } while (static::query()->where('number', $n)->exists() || strlen($n) < 11);

        return $n;
    }
}
