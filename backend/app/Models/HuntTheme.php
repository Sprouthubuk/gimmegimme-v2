<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A reusable look and wording for a Mystery Hunt (symbol name, hashtag, Facebook group, artwork, colours). */
class HuntTheme extends Model
{
    protected $guarded = ['id'];

    public function symbolImageUrl(): ?string
    {
        $i = (string) $this->symbol_image;

        return $i === '' ? null : (str_starts_with($i, 'http') || str_starts_with($i, '/') ? $i : '/storage/'.ltrim($i, '/'));
    }
}
