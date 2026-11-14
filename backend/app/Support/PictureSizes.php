<?php

namespace App\Support;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Smaller WebP copies of an uploaded competition picture, so a card doesn't download a 650 KB original
 * to show it at 288px. Copies sit beside the uploads on the public disk (variants/…-400.webp) and are
 * made when a picture is saved (Competition::saved) or by `php artisan gimme:picture-sizes`.
 * A picture without copies still works: the API just sends the original.
 */
class PictureSizes
{
    public const WIDTHS = [400, 800, 1200];

    /** Fields for an API response: the original, a small copy for thumbnails, and the list for srcset. */
    public static function fields(?string $image, string $url): array
    {
        $sizes = self::existing($image);

        return [
            'image' => $url,
            'imageSmall' => $sizes[400] ?? $url,
            'imageSrcset' => $sizes ? implode(', ', array_map(fn ($w, $u) => "{$u} {$w}w", array_keys($sizes), $sizes)) : null,
        ];
    }

    /** Make the copies for one upload. Returns how many were written; never throws. */
    public static function make(?string $image): int
    {
        if (! self::isUpload($image)) {
            return 0;
        }
        $disk = Storage::disk('public');
        try {
            if (! $disk->exists($image)) {
                return 0;
            }
            $src = @imagecreatefromstring($disk->get($image));
            if (! $src) {
                return 0;
            }
            $w = imagesx($src);
            $made = 0;
            foreach (self::WIDTHS as $width) {
                $target = min($width, $w);
                $copy = imagescale($src, $target, -1, IMG_BICUBIC);
                if (! $copy) {
                    continue;
                }
                ob_start();
                imagewebp($copy, null, 80);
                $disk->put(self::path($image, $width), (string) ob_get_clean());
                imagedestroy($copy);
                $made++;
            }
            imagedestroy($src);

            return $made;
        } catch (\Throwable $e) {
            Log::warning('Picture copies not made', ['image' => $image, 'error' => $e->getMessage()]);

            return 0;
        }
    }

    /** width => URL of the copies that exist for this upload. */
    public static function existing(?string $image): array
    {
        if (! self::isUpload($image)) {
            return [];
        }
        $disk = Storage::disk('public');
        $out = [];
        foreach (self::WIDTHS as $w) {
            if ($disk->exists(self::path($image, $w))) {
                $out[$w] = '/storage/'.self::path($image, $w);
            }
        }

        return $out;
    }

    public static function path(string $image, int $width): string
    {
        $info = pathinfo(ltrim($image, '/'));
        $dir = ($info['dirname'] ?? '.') === '.' ? '' : $info['dirname'].'/';

        return 'variants/'.$dir.$info['filename'].'-'.$width.'.webp';
    }

    /** Only files on the public disk get copies (seeded /media pictures and web addresses don't). */
    private static function isUpload(?string $image): bool
    {
        return is_string($image) && $image !== '' && ! str_starts_with($image, 'http') && ! str_starts_with($image, '/');
    }
}
