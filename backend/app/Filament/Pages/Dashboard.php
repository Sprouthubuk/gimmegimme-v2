<?php

namespace App\Filament\Pages;

use Filament\Pages\Dashboard as BaseDashboard;

/** The admin home: a greeting, then the widgets in app/Filament/Widgets. */
class Dashboard extends BaseDashboard
{
    public function getHeading(): string
    {
        $hour = (int) now('Europe/London')->format('G');
        $part = $hour < 12 ? 'Morning' : ($hour < 18 ? 'Afternoon' : 'Evening');
        $name = auth()->user()?->first_name;

        return "Good {$part}".($name ? ", {$name}" : '');
    }

    public function getSubheading(): ?string
    {
        return now('Europe/London')->format('l j F Y').' · here is how Gimme Gimme is doing';
    }
}
