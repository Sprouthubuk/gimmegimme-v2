<?php

namespace App\Filament\Resources\PrizeClaims;

use App\Filament\Resources\PrizeClaims\Pages\ListPrizeClaims;
use App\Filament\Support\Money;
use App\Models\AdminAction;
use App\Models\PrizeClaim;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Forms\Components\Textarea;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;

/** Draw wins and physical instant prizes: handled by a person. */
class PrizeClaimResource extends Resource
{
    protected static ?string $model = PrizeClaim::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedGift;

    protected static ?string $navigationLabel = 'Prizes to send';

    protected static ?int $navigationSort = 5;

    public static function canCreate(): bool
    {
        return false;
    }

    public static function getNavigationBadge(): ?string
    {
        $n = PrizeClaim::query()->where('status', 'open')->count();

        return $n ? (string) $n : null;
    }

    public static function table(Table $table): Table
    {
        return $table->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('prize_name')->wrap(),
                TextColumn::make('value_pence')->label('Value')->formatStateUsing(fn ($state) => Money::show($state)),
                TextColumn::make('kind')->badge(),
                TextColumn::make('competition.title')->wrap(),
                TextColumn::make('user.email')->label('Winner')->copyable(),
                TextColumn::make('status')->badge(),
                TextColumn::make('created_at')->label('Won')->dateTime('j M Y, H:i', 'Europe/London'),
            ])
            ->filters([SelectFilter::make('status')->options(['open' => 'Open', 'fulfilled' => 'Fulfilled'])])
            ->recordActions([
                Action::make('fulfil')->label('Mark sent')->visible(fn (PrizeClaim $c) => $c->status === 'open')
                    ->schema([Textarea::make('note')->label('How it was sent / paid')->required()->maxLength(300)])
                    ->action(function (PrizeClaim $c, array $data) {
                        $c->forceFill(['status' => 'fulfilled'])->save();
                        AdminAction::record(auth()->user(), 'prize.fulfilled', (string) $c->id, $data['note']);
                    }),
            ]);
    }

    public static function getPages(): array
    {
        return ['index' => ListPrizeClaims::route('/')];
    }
}
