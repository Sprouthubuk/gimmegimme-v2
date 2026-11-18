<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/** A "Buy X Get Y Free" preset. Competitions choose which ones they offer. */
class BundleTier extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'paid_qty' => 'integer', 'free_qty' => 'integer', 'sort_order' => 'integer'];
    }

    protected static function booted(): void
    {
        static::saving(function (BundleTier $t) {
            if ($t->paid_qty < 1 || $t->free_qty < 1) {
                throw new \DomainException('A bundle needs at least one paid and one free ticket.');
            }
        });
    }

    public function competitions(): BelongsToMany
    {
        return $this->belongsToMany(Competition::class, 'competition_bundle_tier')->withPivot(['is_featured', 'override_label']);
    }

    public function total(): int
    {
        return $this->paid_qty + $this->free_qty;
    }

    /** "Buy 5 Get 5 Free", unless the admin wrote a label (here or on the competition). */
    public function displayLabel(?string $override = null): string
    {
        $label = trim((string) ($override ?: $this->label));

        return $label !== '' ? $label : self::autoLabel($this->paid_qty, $this->free_qty);
    }

    public static function autoLabel(int $paid, int $free): string
    {
        return "Buy {$paid} Get {$free} Free";
    }
}
