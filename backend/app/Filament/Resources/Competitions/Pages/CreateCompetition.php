<?php

namespace App\Filament\Resources\Competitions\Pages;

use App\Filament\Resources\Competitions\CompetitionResource;
use Filament\Resources\Pages\CreateRecord;

class CreateCompetition extends CreateRecord
{
    protected static string $resource = CompetitionResource::class;

    /** No limit per person (owner's decision, 18 Nov 2026): anyone may buy up to every ticket. */
    use SavesBundles;

    protected function mutateFormDataBeforeCreate(array $data): array
    {
        return $this->takeBundleData(['max_per_person' => (int) ($data['max_tickets'] ?? 1)] + $data);
    }

    protected function afterCreate(): void
    {
        $this->saveBundles($this->record);
    }
}
