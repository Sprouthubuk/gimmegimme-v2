<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompetitionPrize extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    public function competition(): BelongsTo
    {
        return $this->belongsTo(Competition::class);
    }
}
