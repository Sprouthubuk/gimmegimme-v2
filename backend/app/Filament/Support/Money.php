<?php

namespace App\Filament\Support;

use Filament\Forms\Components\TextInput;

/** Money is typed in pounds and stored in whole pence. */
final class Money
{
    public static function input(string $column, string $label): TextInput
    {
        return TextInput::make($column)->label($label)->prefix('£')->inputMode('decimal')
            ->rule('regex:/^\d{1,7}(\.\d{1,2})?$/')
            ->formatStateUsing(fn ($state) => $state === null ? null : number_format(((int) $state) / 100, 2, '.', ''))
            ->dehydrateStateUsing(fn ($state) => $state === null || $state === '' ? null : self::toPence((string) $state));
    }

    public static function toPence(string $pounds): int
    {
        [$w, $f] = array_pad(explode('.', trim($pounds), 2), 2, '');

        return ((int) $w) * 100 + (int) substr(str_pad($f, 2, '0'), 0, 2);
    }

    public static function show(?int $pence): string
    {
        return $pence === null ? '—' : '£'.number_format($pence / 100, 2);
    }
}
