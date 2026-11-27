<?php

namespace App\Filament\Pages;

use App\Filament\Support\Money;
use App\Support\ConsentChoices;
use App\Support\MetaTrackingReport as Report;
use App\Tracking\MetaEvents;
use BackedEnum;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;

/**
 * Site sales next to what Meta was told, per UK day: why Ads Manager shows a different number.
 */
class MetaTrackingReport extends Page
{
    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedSignal;

    protected static ?string $title = 'Meta Tracking Report';

    protected static string|\UnitEnum|null $navigationGroup = 'Reports';

    protected static ?int $navigationSort = 9;

    protected static ?string $slug = 'meta-tracking-report';

    protected string $view = 'filament.pages.meta-tracking-report';

    public const DAYS = 14;

    public function rows(): array
    {
        return Report::daily(self::DAYS);
    }

    /** Cookie banner choices per UK day, totals only (App\Support\ConsentChoices). */
    public function choices(): array
    {
        return ConsentChoices::daily(self::DAYS);
    }

    public function errors(): array
    {
        return Report::recentErrors();
    }

    public function setup(): array
    {
        return ['pixel' => MetaEvents::pixelId() !== null, 'token' => (string) config('services.meta.capi_token') !== ''];
    }

    public function money(int $pence): string
    {
        return Money::show($pence);
    }

    public function pct(int $a, int $b): string
    {
        return $b > 0 ? round($a * 100 / $b).'%' : '—';
    }
}
