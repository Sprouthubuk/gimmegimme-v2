<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * A few seconds' reuse of public API answers that are the same for every signed-out visitor, kept in files (not
 * the database, which is what's busy when the site is). Never for anything that depends on who is asking.
 * Prices, limits and stock are still checked from the database at checkout, so a few seconds' old page is safe.
 */
final class PublicCache
{
    /**
     * @template T
     *
     * @param  callable(): T  $make
     * @return T
     */
    public static function remember(string $key, callable $make): mixed
    {
        $seconds = (int) config('app.public_cache_seconds');
        if ($seconds <= 0) {
            return $make();
        }
        $key = 'public-api:'.$key;
        // A cache that can't be read or written never stops the page: it's simply worked out again.
        try {
            $store = Cache::store('file');
            $hit = $store->get($key);
            if ($hit !== null) {
                return $hit;
            }
        } catch (\Throwable) {
            return $make();
        }
        $value = $make();
        try {
            $store->put($key, $value, $seconds);
        } catch (\Throwable) {
            // Not kept this time; the next visitor works it out again.
        }

        return $value;
    }
}
