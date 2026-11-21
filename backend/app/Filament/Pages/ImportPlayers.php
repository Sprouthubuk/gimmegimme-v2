<?php

namespace App\Filament\Pages;

use App\Jobs\ImportPlayersJob;
use App\Models\AdminAction;
use App\Support\PlayerImportRun;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Illuminate\Support\Facades\Storage;

/**
 * Moving players over from the old Lovable site: upload players.csv and balances.csv (the two exports in
 * docs/lovable-import.md), Check (a practice run that writes nothing), then Import. Both run
 * `gimme:import-lovable` in the background. Files stay on the private disk and are deleted after the import.
 */
class ImportPlayers extends Page
{
    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedArrowUpTray;

    protected static ?string $navigationLabel = 'Import Players';

    protected static ?string $title = 'Import Players From The Old Site';

    protected static ?int $navigationSort = 90;

    protected static string|\UnitEnum|null $navigationGroup = 'Players & Money';

    protected string $view = 'filament.pages.import-players';

    public ?array $data = [];

    public function mount(): void
    {
        $this->form->fill();
    }

    public function form(Schema $schema): Schema
    {
        $csv = ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'];

        return $schema->statePath('data')->components([
            FileUpload::make('players')->label('players.csv')->disk('local')->directory('imports/incoming')->visibility('private')
                ->acceptedFileTypes($csv)->maxSize(51200)->required()->helperText('One row per player, with its header row.'),
            FileUpload::make('balances')->label('balances.csv')->disk('local')->directory('imports/incoming')->visibility('private')
                ->acceptedFileTypes($csv)->maxSize(51200)->helperText('Wallet balances. Leave empty only if no player has money in their wallet.'),
        ]);
    }

    public function run(): ?PlayerImportRun
    {
        return PlayerImportRun::current();
    }

    /** What the page shows about the current upload. */
    public function status(): array
    {
        return $this->run()?->status() ?? [];
    }

    public function busy(): bool
    {
        return in_array($this->status()['state'] ?? null, ['queued', 'running'], true);
    }

    /** The real import is only offered after a check of these same files passed. */
    public function checkedOk(): bool
    {
        $s = $this->status();

        return ($s['state'] ?? null) === 'done' && ($s['ok'] ?? false) && ($s['dry'] ?? false) && $this->run()?->has('players.csv');
    }

    public function checkAction(): Action
    {
        return Action::make('check')->label('Check files (changes nothing)')->color('gray')->icon(Heroicon::OutlinedMagnifyingGlass)
            ->disabled(fn () => $this->busy())
            ->action(function () {
                $state = $this->form->getState();
                $this->run()?->delete();
                $run = PlayerImportRun::start();
                $disk = Storage::disk('local');
                foreach (['players' => 'players.csv', 'balances' => 'balances.csv'] as $field => $name) {
                    $path = is_array($state[$field] ?? null) ? reset($state[$field]) : ($state[$field] ?? null);
                    if ($path) {
                        $disk->move($path, $run->path($name));
                    }
                }
                $this->form->fill();
                $run->write(['state' => 'queued', 'dry' => true]);
                ImportPlayersJob::dispatch($run->id, true, (int) auth()->id());
                Notification::make()->success()->title('Checking the files')->body('This page updates by itself when the check is done.')->send();
            });
    }

    public function importAction(): Action
    {
        return Action::make('import')->label('Import players')->color('danger')->icon(Heroicon::OutlinedArrowDownTray)
            ->visible(fn () => $this->checkedOk())
            ->requiresConfirmation()
            ->modalDescription('Creates the accounts and wallet balances from the checked files. Take a database backup first. Safe to run again: nobody is added twice and no balance is paid twice.')
            ->schema([
                Textarea::make('reason')->label('Reason')->required()->maxLength(300)->default('Switch-over from the Lovable site'),
                TextInput::make('confirm')->label('Type IMPORT to go ahead')->required()->in(['IMPORT'])->validationMessages(['in' => 'Type IMPORT in capitals.']),
            ])
            ->action(function (array $data) {
                $run = $this->run();
                if (! $run || ! $this->checkedOk()) {
                    Notification::make()->danger()->title('Check the files first')->send();

                    return;
                }
                $run->write(['state' => 'queued', 'dry' => false]);
                ImportPlayersJob::dispatch($run->id, false, (int) auth()->id(), $data['reason']);
                Notification::make()->success()->title('Importing')->body('This page updates by itself when it is done.')->send();
            });
    }

    public function removeAction(): Action
    {
        return Action::make('remove')->label('Delete uploaded files')->color('gray')->icon(Heroicon::OutlinedTrash)
            ->visible(fn () => $this->run() !== null && ! $this->busy())
            ->requiresConfirmation()
            ->action(function () {
                $run = $this->run();
                $run?->delete();
                AdminAction::record(auth()->user(), 'players.import_files_deleted', $run?->id, null);
                Notification::make()->success()->title('Files deleted')->send();
            });
    }
}
