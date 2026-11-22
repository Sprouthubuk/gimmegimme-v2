<?php

namespace App\Filament\Widgets;

use App\Filament\Pages\WinsReport;
use App\Filament\Resources\Users\UserResource;
use App\Filament\Support\Money;
use App\Support\Reports;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget;

/** The latest big wins (the line is in Settings), last 7 days. */
class BigWins extends TableWidget
{
    protected static ?int $sort = 4;

    protected int|string|array $columnSpan = 1;

    protected ?string $pollingInterval = '60s';

    public function getTableHeading(): string
    {
        return 'Big Wins · '.Money::show(Reports::bigWinPence()).'+ · Last 7 Days';
    }

    public function table(Table $table): Table
    {
        return $table
            ->query(WinsReport::query()->where('verity_winners.prize_value_pence', '>=', Reports::bigWinPence())
                ->where('verity_winners.created_at', '>=', now()->subDays(7))->orderByDesc('verity_winners.created_at')->limit(8))
            ->paginated(false)
            ->emptyStateHeading('No big wins in the last 7 days')
            ->recordUrl(fn ($record) => $record->user_id ? UserResource::getUrl('view', ['record' => $record->user_id]) : WinsReport::getUrl())
            ->columns([
                TextColumn::make('first_name')->label('Player')->formatStateUsing(fn ($state, $record) => trim($record->first_name.' '.$record->last_name))->placeholder('—'),
                TextColumn::make('prize_name')->label('Prize')->description(fn ($record) => $record->competition_title)->wrap(),
                TextColumn::make('prize_value_pence')->label('Value')->formatStateUsing(fn ($state) => Money::show((int) $state))->weight('bold')->alignEnd(),
                TextColumn::make('created_at')->label('When')->since('Europe/London'),
            ]);
    }
}
