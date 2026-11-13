<?php

namespace App\Models;

use App\Support\GameIds;
use App\Support\PictureSizes;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Sprouthub\Verity\Models\Competition as VerityCompetition;

class Competition extends Model
{
    use HasUlids;

    protected $guarded = ['id', 'verity_ref', 'published_at'];

    /** Once published, these are Verity's terms and never change. */
    public const LOCKED_WHEN_PUBLISHED = ['type', 'price_pence', 'max_tickets', 'max_per_person', 'min_tickets', 'closes_at', 'end_prize_count', 'end_prize_type'];

    /** How an end prize is paid: to the winner's winnings automatically, or handled by hand. */
    public const END_PRIZE_TYPES = ['site_credit' => 'Site credit (paid to winnings automatically)', 'physical' => 'Handled by hand (cars, holidays, cash by transfer…)'];

    protected function casts(): array
    {
        return [
            'presets' => 'array',
            'tags' => 'array',
            'featured' => 'boolean',
            'opens_at' => 'datetime',
            'closes_at' => 'datetime',
            'published_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Only known games and skins (shared/game-ids.json). A skin is presentation only.
        // Smaller WebP copies of a new picture, for cards and thumbnails (App\Support\PictureSizes).
        static::saved(function (Competition $c) {
            if ($c->wasChanged('image') || $c->wasRecentlyCreated) {
                PictureSizes::make($c->image);
            }
        });
        static::saving(function (Competition $c) {
            if (! in_array($c->skin ?? 'classic', GameIds::skins(), true)) {
                throw new \DomainException("Unknown game skin: {$c->skin}.");
            }
            if ($c->game !== null && ! in_array($c->game, GameIds::games(), true)) {
                throw new \DomainException("Unknown reveal game: {$c->game}.");
            }
        });
        static::updating(function (Competition $c) {
            if ($c->getOriginal('verity_ref') !== null) {
                foreach (self::LOCKED_WHEN_PUBLISHED as $field) {
                    if ($c->isDirty($field)) {
                        throw new \DomainException("The {$field} of a published competition can't be changed.");
                    }
                }
            }
        });
        static::deleting(function (Competition $c) {
            if ($c->verity_ref !== null) {
                throw new \DomainException('A published competition is never deleted.');
            }
        });
    }

    public function prizes(): HasMany
    {
        return $this->hasMany(CompetitionPrize::class)->orderBy('sort')->orderByDesc('value_pence');
    }

    public function verity(): ?VerityCompetition
    {
        return $this->verity_ref ? VerityCompetition::query()->where('ref', $this->verity_ref)->first() : null;
    }

    public function isInstant(): bool
    {
        return $this->type === 'instant';
    }

    public function hasDraw(): bool
    {
        return $this->type === 'draw' || $this->end_prize_name !== null;
    }

    public function scopePublished($q)
    {
        return $q->whereNotNull('verity_ref');
    }

    /** The picture as a web address: uploads live on the public disk (/storage/…). */
    public function imageUrl(): string
    {
        $i = (string) $this->image;

        return $i === '' || str_starts_with($i, 'http') || str_starts_with($i, '/') ? $i : '/storage/'.ltrim($i, '/');
    }

    /** The picture fields for the API: the original, a small copy and the sizes for srcset. */
    public function pictureFields(): array
    {
        return PictureSizes::fields($this->image, $this->imageUrl());
    }

    /** The ticket buttons on the competition page, smallest first. */
    public function presetList(): array
    {
        $p = array_values(array_unique(array_filter(array_map('intval', $this->presets ?? []), fn ($n) => $n > 0)));
        sort($p);

        return $p ?: ($this->type === 'draw' ? [1, 5, 10, 25] : [5, 10, 25, 50]);
    }

    /** The button marked "Most popular", if it is one of the buttons. */
    public function popularPreset(): ?int
    {
        $n = (int) $this->popular_preset;

        return $n > 0 && in_array($n, $this->presetList(), true) ? $n : null;
    }

    /** How many end prizes are drawn (0 when there is no end prize). */
    public function endPrizeCount(): int
    {
        return $this->end_prize_name ? max(1, (int) ($this->end_prize_count ?: 1)) : 0;
    }
}
