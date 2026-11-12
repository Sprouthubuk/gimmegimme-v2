<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContactMessage extends Model
{
    protected function casts(): array
    {
        return ['handled_at' => 'datetime'];
    }

    protected $table = 'contact_messages';

    protected $guarded = ['id'];
}
