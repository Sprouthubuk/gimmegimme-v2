<?php

namespace App\Support;

use App\Models\Competition;
use App\Models\User;

/**
 * The live draw screen's presenter key: made by the admin's "Live Draw Screen" button, it lets that screen see a held
 * result and publish it. Tied to one competition and one admin, signed with the app key, good for two days.
 */
final class PresenterKey
{
    public const DAYS = 2;

    public static function make(Competition $c, User $admin): string
    {
        $body = rtrim(strtr(base64_encode(json_encode(['c' => $c->id, 'a' => $admin->id, 'e' => now()->addDays(self::DAYS)->timestamp])), '+/', '-_'), '=');

        return $body.'.'.self::sign($body);
    }

    /** The admin who made a valid key for this competition, or null. */
    public static function admin(?string $key, Competition $c): ?User
    {
        if (! is_string($key) || ! preg_match('/^[A-Za-z0-9_-]{10,400}\.[a-f0-9]{64}$/', $key)) {
            return null;
        }
        [$body, $sig] = explode('.', $key, 2);
        if (! hash_equals(self::sign($body), $sig)) {
            return null;
        }
        $data = json_decode((string) base64_decode(strtr($body, '-_', '+/')), true);
        if (! is_array($data) || ($data['c'] ?? null) !== $c->id || (int) ($data['e'] ?? 0) < now()->timestamp) {
            return null;
        }
        $admin = User::query()->find((int) ($data['a'] ?? 0));

        return $admin !== null && $admin->is_admin && $admin->closed_at === null ? $admin : null;
    }

    private static function sign(string $body): string
    {
        return hash_hmac('sha256', 'live-draw|'.$body, (string) config('app.key'));
    }
}
