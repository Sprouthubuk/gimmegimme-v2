<?php

namespace App\Filament\Support;

use Filament\AvatarProviders\Contracts\AvatarProvider;
use Filament\Facades\Filament;
use Illuminate\Database\Eloquent\Model;

/** Initials on a pink-to-cyan disc, drawn here: Filament's default asks ui-avatars.com, sending the admin's name off site. */
final class InitialsAvatar implements AvatarProvider
{
    public function get(Model $record): string
    {
        $name = trim((string) Filament::getNameForDefaultAvatar($record));
        $initials = collect(preg_split('/\s+/', $name) ?: [])->filter()->take(2)->map(fn ($w) => mb_strtoupper(mb_substr($w, 0, 1)))->implode('') ?: '?';
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
            .'<stop offset="0" stop-color="#ff2daa"/><stop offset="1" stop-color="#22e6ff"/></linearGradient></defs>'
            .'<rect width="64" height="64" rx="32" fill="url(#g)"/><text x="32" y="41" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-size="26" font-weight="800" fill="#07050b">'
            .htmlspecialchars($initials, ENT_QUOTES | ENT_XML1).'</text></svg>';

        return 'data:image/svg+xml;base64,'.base64_encode($svg);
    }
}
