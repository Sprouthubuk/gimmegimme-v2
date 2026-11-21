<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A competition from the old site, read-only (gimme:import-archive). Not a Verity record. */
class ArchiveCompetition extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['drawn_at' => 'datetime'];
    }

    public function winners(): HasMany
    {
        return $this->hasMany(ArchiveWinner::class);
    }

    public function entries(): HasMany
    {
        return $this->hasMany(ArchiveEntry::class);
    }

    public function imageUrl(): string
    {
        $i = (string) $this->image;

        return $i === '' || str_starts_with($i, 'http') || str_starts_with($i, '/') ? $i : '/storage/'.ltrim($i, '/');
    }
}
