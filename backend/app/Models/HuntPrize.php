<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A prize hidden behind a hunt symbol (cash to winnings, or ticket credit to bonus). Quantity copies, one per symbol. */
class HuntPrize extends Model
{
    public const TYPES = ['cash' => 'Cash (to winnings)', 'ticket_credit' => 'Ticket credit (to bonus, expires)'];

    public $timestamps = false;

    protected $guarded = ['id'];

    public function competition(): BelongsTo
    {
        return $this->belongsTo(Competition::class);
    }
}
