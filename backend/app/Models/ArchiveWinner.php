<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A winner on the old site, with the masked name it showed (gimme:import-archive). */
class ArchiveWinner extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['won_at' => 'datetime'];
    }

    public function competition(): BelongsTo
    {
        return $this->belongsTo(ArchiveCompetition::class, 'archive_competition_id');
    }
}
