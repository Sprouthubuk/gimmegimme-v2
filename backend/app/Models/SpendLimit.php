<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SpendLimit extends Model
{
    protected $primaryKey = 'user_id';

    public $incrementing = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['pending_applies_at' => 'datetime', 'pending_remove' => 'boolean', 'weekly_summary' => 'boolean'];
    }
}
