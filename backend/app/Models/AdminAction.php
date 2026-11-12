<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AdminAction extends Model
{
    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return ['detail' => 'array'];
    }

    public static function record(User $admin, string $action, ?string $subject, ?string $reason, array $detail = []): void
    {
        static::query()->create(['admin_id' => $admin->id, 'action' => $action, 'subject' => $subject, 'reason' => $reason, 'detail' => $detail]);
    }

    protected $table = 'admin_actions';

    protected $guarded = ['id'];
}
