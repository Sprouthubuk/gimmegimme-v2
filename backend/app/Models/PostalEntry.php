<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PostalEntry extends Model
{
    protected function casts(): array
    {
        return ['received_at' => 'datetime'];
    }

    protected $table = 'postal_entries';

    protected $guarded = ['id'];
}
