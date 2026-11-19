<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A packed Gimme Box. Its lines hold tickets for a few minutes (HOLDING) so the price shown is honoured. */
class GimmeBox extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    /** Statuses whose tickets are held while expires_at is in the future. */
    public const HOLDING = ['built', 'added'];

    protected function casts(): array
    {
        return ['lines' => 'array', 'expires_at' => 'datetime'];
    }

    /** The box's entry for one competition, or null. */
    public function lineFor(string $competitionId): ?array
    {
        foreach ($this->lines as $l) {
            if ($l['competition_id'] === $competitionId) {
                return $l;
            }
        }

        return null;
    }
}
