<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompetitionPrize extends Model
{
    /**
     * Instant prize types. ticket_credit goes to bonus (tickets only, expires); hunt_symbol is a Mystery Hunt symbol,
     * worth nothing itself: the player picks a number on the Hunt Board (docs/mystery-hunt.md).
     */
    public const TYPES = ['cash' => 'Cash (to winnings)', 'site_credit' => 'Site credit (to winnings)', 'ticket_credit' => 'Ticket credit (to bonus, expires)',
        'physical' => 'Physical (handled by hand)', 'hunt_symbol' => 'Hunt symbol (pick a number)'];

    /** @var array<string, list<string>> which types a competition can use */
    public const TYPES_FOR = ['instant' => ['cash', 'site_credit', 'ticket_credit', 'physical'], 'hunt' => ['cash', 'site_credit', 'ticket_credit', 'physical', 'hunt_symbol']];

    public $timestamps = false;

    protected $guarded = ['id'];

    public function competition(): BelongsTo
    {
        return $this->belongsTo(Competition::class);
    }
}
