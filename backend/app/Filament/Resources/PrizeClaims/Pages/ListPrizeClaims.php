<?php

namespace App\Filament\Resources\PrizeClaims\Pages;

use App\Filament\Resources\PrizeClaims\PrizeClaimResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListPrizeClaims extends ListRecords
{
    protected static string $resource = PrizeClaimResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
