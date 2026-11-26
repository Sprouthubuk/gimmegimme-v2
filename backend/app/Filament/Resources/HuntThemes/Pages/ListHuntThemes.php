<?php

namespace App\Filament\Resources\HuntThemes\Pages;

use App\Filament\Resources\HuntThemes\HuntThemeResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListHuntThemes extends ListRecords
{
    protected static string $resource = HuntThemeResource::class;

    protected function getHeaderActions(): array
    {
        return [CreateAction::make()];
    }
}
