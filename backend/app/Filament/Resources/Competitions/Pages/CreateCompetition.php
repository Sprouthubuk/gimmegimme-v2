<?php

namespace App\Filament\Resources\Competitions\Pages;

use App\Filament\Resources\Competitions\CompetitionResource;
use Filament\Resources\Pages\CreateRecord;

class CreateCompetition extends CreateRecord
{
    protected static string $resource = CompetitionResource::class;

    use SavesBundles;

    /** Max tickets per person (owner, 22 Nov 2026): left empty means no limit, stored as the number of tickets. */
    protected function mutateFormDataBeforeCreate(array $data): array
    {
        $data['max_per_person'] = (int) ($data['max_per_person'] ?? 0) ?: (int) ($data['max_tickets'] ?? 1);

        return $this->takeBundleData($data);
    }

    protected function afterCreate(): void
    {
        $this->saveBundles($this->record);
    }
}
