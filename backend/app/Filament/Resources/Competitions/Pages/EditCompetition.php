<?php

namespace App\Filament\Resources\Competitions\Pages;

use App\Filament\Resources\Competitions\CompetitionResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditCompetition extends EditRecord
{
    protected static string $resource = CompetitionResource::class;

    /** No limit per person: follows the number of tickets until the competition is published (then both are fixed). */
    use SavesBundles;

    protected function mutateFormDataBeforeFill(array $data): array
    {
        if ((int) ($data['max_per_person'] ?? 0) >= (int) ($data['max_tickets'] ?? 0)) {
            $data['max_per_person'] = null; // no limit
        }

        return $data + $this->bundleFormData($this->record);
    }

    protected function mutateFormDataBeforeSave(array $data): array
    {
        // Empty means no limit (stored as the number of tickets); both are fixed once published.
        if ($this->record->verity_ref === null && isset($data['max_tickets'])) {
            $data['max_per_person'] = (int) ($data['max_per_person'] ?? 0) ?: (int) $data['max_tickets'];
        }

        return $this->takeBundleData($data);
    }

    protected function afterSave(): void
    {
        $this->saveBundles($this->record);
    }

    protected function getHeaderActions(): array
    {
        return [
            CompetitionResource::publishAction(),
            CompetitionResource::openNowAction(),
            CompetitionResource::previewGameAction(),
            DeleteAction::make()->visible(fn () => $this->record->verity_ref === null),
        ];
    }
}
