<?php

namespace App\Filament\Pages;

use App\Filament\Resources\Users\UserResource;
use App\Filament\Support\Money;
use App\Models\BoostPrize;
use BackedEnum;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Concerns\InteractsWithTable;
use Filament\Tables\Contracts\HasTable;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;
use Illuminate\Support\Facades\Storage;

/**
 * Prize boosts (App\Services\PrizeBoosts): every added instant prize, its number and who won it, plus the saved
 * output of each competitions:boost-prizes run (dry runs included). Read only: added prizes never change.
 */
class PrizeBoostReport extends Page implements HasTable
{
    use InteractsWithTable;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedFire;

    protected static ?string $title = 'Prize Boosts';

    protected static ?string $navigationLabel = 'Prize Boosts';

    protected static string|\UnitEnum|null $navigationGroup = 'Reports';

    protected static ?int $navigationSort = 4;

    protected static ?string $slug = 'prize-boosts';

    protected string $view = 'filament.pages.prize-boosts';

    /** @return list<array{name: string, text: string}> the latest saved runs, newest first */
    public function runs(): array
    {
        return collect(Storage::disk('local')->files('boosts'))->sortDesc()->take(6)
            ->map(fn ($f) => ['name' => basename($f), 'text' => (string) Storage::disk('local')->get($f)])->values()->all();
    }

    public function table(Table $table): Table
    {
        return $table
            ->query(BoostPrize::query()->with(['competition', 'winner']))
            ->defaultSort('value_pence', 'desc')
            ->recordUrl(fn (BoostPrize $p) => $p->won_user_id ? UserResource::getUrl('view', ['record' => $p->won_user_id]) : null)
            ->columns([
                TextColumn::make('competition.title')->label('Competition')->wrap(),
                TextColumn::make('name')->label('Prize')->searchable(),
                TextColumn::make('value_pence')->label('Value')->formatStateUsing(fn ($state) => Money::show((int) $state))->sortable(),
                TextColumn::make('ticket_number')->label('Ticket')->searchable()->sortable(),
                TextColumn::make('added_at')->label('Added')->dateTime('j M Y, H:i', 'Europe/London'),
                TextColumn::make('won_at')->label('Won')->dateTime('j M Y, H:i', 'Europe/London')->placeholder('Not won yet')->sortable(),
                TextColumn::make('winner.email')->label('Winner')->placeholder('—'),
            ])
            ->filters([
                SelectFilter::make('competition_id')->label('Competition')->relationship('competition', 'title'),
                TernaryFilter::make('won')->label('Won')->queries(true: fn ($q) => $q->whereNotNull('won_at'), false: fn ($q) => $q->whereNull('won_at')),
            ])
            ->paginated([25, 50, 100]);
    }
}
