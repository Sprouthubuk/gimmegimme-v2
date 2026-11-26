<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One symbol won in a hunt: found, then picked (paid once) or expired (not won). */
class HuntClaim extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['found_at' => 'datetime', 'deadline_at' => 'datetime', 'reminded_at' => 'datetime', 'picked_at' => 'datetime'];
    }

    public function competition(): BelongsTo
    {
        return $this->belongsTo(Competition::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
