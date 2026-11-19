<?php

namespace App\Filament\Resources\BundleTiers\Pages;

use App\Filament\Resources\BundleTiers\BundleTierResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListBundleTiers extends ListRecords
{
    protected static string $resource = BundleTierResource::class;

    protected function getHeaderActions(): array
    {
        return [CreateAction::make()];
    }
}
