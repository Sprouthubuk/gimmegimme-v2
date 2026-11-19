<?php

namespace App\Filament\Resources\BundleTiers;

use App\Filament\Resources\BundleTiers\Pages\CreateBundleTier;
use App\Filament\Resources\BundleTiers\Pages\EditBundleTier;
use App\Filament\Resources\BundleTiers\Pages\ListBundleTiers;
use App\Models\BundleTier;
use BackedEnum;
use Filament\Actions\EditAction;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

/** "Buy X Get Y Free" presets. Each live draw picks which of these it offers (Competitions → Bundles). */
class BundleTierResource extends Resource
{
    protected static ?string $model = BundleTier::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedGift;

    protected static ?string $navigationLabel = 'Bundles';

    protected static ?string $modelLabel = 'bundle';

    protected static ?int $navigationSort = 3;

    protected static string|\UnitEnum|null $navigationGroup = 'Competitions';

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            TextInput::make('paid_qty')->label('Paid tickets')->integer()->minValue(1)->maxValue(100000)->required(),
            TextInput::make('free_qty')->label('Free tickets')->integer()->minValue(1)->maxValue(100000)->required(),
            TextInput::make('label')->maxLength(60)->helperText('Leave empty for “Buy 5 Get 5 Free”.'),
            TextInput::make('sort_order')->integer()->minValue(0)->default(0),
            Toggle::make('is_active')->label('Active')->default(true)->helperText('Off: no competition sells it, wherever it is attached.'),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table->defaultSort('sort_order')->columns([
            TextColumn::make('label')->state(fn (BundleTier $t) => $t->displayLabel()),
            TextColumn::make('paid_qty')->label('Paid'),
            TextColumn::make('free_qty')->label('Free'),
            TextColumn::make('total')->label('Tickets')->state(fn (BundleTier $t) => $t->total()),
            TextColumn::make('price_share')->label('Price vs singles')->state(fn (BundleTier $t) => round($t->paid_qty * 100 / $t->total()).'%'),
            TextColumn::make('competitions_count')->label('Competitions')->counts('competitions'),
            IconColumn::make('is_active')->label('Active')->boolean(),
        ])->recordActions([EditAction::make()]);
    }

    public static function getPages(): array
    {
        return ['index' => ListBundleTiers::route('/'), 'create' => CreateBundleTier::route('/create'), 'edit' => EditBundleTier::route('/{record}/edit')];
    }
}
