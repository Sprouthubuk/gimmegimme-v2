<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Filament\Models\Contracts\FilamentUser;
use Filament\Models\Contracts\HasName;
use Filament\Panel;
use Illuminate\Auth\MustVerifyEmail as MustVerifyEmailTrait;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable implements FilamentUser, HasName, MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, MustVerifyEmailTrait, Notifiable;

    /** Fields a player fills once; after that only an admin changes them. */
    public const FILL_ONCE = ['first_name', 'last_name', 'date_of_birth', 'address_line1', 'address_line2', 'city', 'postcode'];

    protected $guarded = ['id', 'is_admin', 'is_staff', 'on_hold_at', 'closed_at', 'id_verified_at', 'email_verified_at'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'date_of_birth' => 'date',
            'marketing_email' => 'boolean',
            'marketing_sms' => 'boolean',
            'win_notifications' => 'boolean',
            'is_admin' => 'boolean',
            'is_staff' => 'boolean',
            'id_verified_at' => 'datetime',
            'on_hold_at' => 'datetime',
            'closed_at' => 'datetime',
            'cool_off_until' => 'datetime',
            'self_excluded_until' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Customer accounts are never deleted: their money, entries and wins hang off them.
        static::deleting(fn () => throw new \DomainException('Accounts are closed, never deleted.'));
    }

    public function canAccessPanel(Panel $panel): bool
    {
        return $this->is_admin && $this->closed_at === null && $this->hasVerifiedEmail();
    }

    public function getFilamentName(): string
    {
        return trim($this->first_name.' '.$this->last_name);
    }

    public function ownerRef(): string
    {
        return 'user:'.$this->id;
    }

    /** "Liam O." — the only form of a player's name ever shown publicly. */
    public function publicName(): string
    {
        return trim($this->first_name.' '.mb_substr((string) $this->last_name, 0, 1).'.');
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function ledger(): HasMany
    {
        return $this->hasMany(LedgerEntry::class);
    }

    public function limits(): HasOne
    {
        return $this->hasOne(SpendLimit::class);
    }
}
