<?php

namespace App\Filament\Resources\PromoCodes;

use App\Filament\Resources\PromoCodes\Pages\CreatePromoCode;
use App\Filament\Resources\PromoCodes\Pages\EditPromoCode;
use App\Filament\Resources\PromoCodes\Pages\ListPromoCodes;
use App\Models\PromoCode;
use BackedEnum;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class PromoCodeResource extends Resource
{
    protected static ?string $model = PromoCode::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedTicket;

    protected static ?int $navigationSort = 7;

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            TextInput::make('code')->required()->alphaDash()->maxLength(32)->unique(ignoreRecord: true),
            TextInput::make('percent_off')->label('% off')->integer()->minValue(1)->maxValue(PromoCode::MAX_PERCENT)->required()
                ->helperText('At most '.PromoCode::MAX_PERCENT.'%: a code never makes an order free.'),
            TextInput::make('max_uses')->integer()->minValue(1)->helperText('Empty for no limit.'),
            DateTimePicker::make('expires_at')->timezone('Europe/London')->seconds(false),
            Toggle::make('active')->default(true),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table->columns([
            TextColumn::make('code')->searchable(), TextColumn::make('percent_off')->suffix('%'),
            TextColumn::make('uses')->formatStateUsing(fn ($state, PromoCode $p) => $state.($p->max_uses ? ' / '.$p->max_uses : '')),
            TextColumn::make('expires_at')->dateTime('j M Y, H:i', 'Europe/London')->placeholder('Never'),
            IconColumn::make('active')->boolean(),
        ])->recordActions([EditAction::make()]);
    }

    public static function getPages(): array
    {
        return ['index' => ListPromoCodes::route('/'), 'create' => CreatePromoCode::route('/create'), 'edit' => EditPromoCode::route('/{record}/edit')];
    }
}
