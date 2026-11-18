<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Withdrawal extends Model
{
    use HasUlids;

    protected function casts(): array
    {
        // Bank details are encrypted in the database and never sent back to the browser.
        return ['decided_at' => 'datetime', 'account_name' => 'encrypted', 'sort_code' => 'encrypted', 'account_number' => 'encrypted'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    protected $table = 'withdrawals';

    protected $guarded = ['id'];

    protected $hidden = ['account_name', 'sort_code', 'account_number'];
}
