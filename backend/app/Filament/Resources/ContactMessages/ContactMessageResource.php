<?php

namespace App\Filament\Resources\ContactMessages;

use App\Filament\Resources\ContactMessages\Pages\ListContactMessages;
use App\Models\ContactMessage;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\ViewAction;
use Filament\Infolists\Components\TextEntry;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;

class ContactMessageResource extends Resource
{
    protected static ?string $model = ContactMessage::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedEnvelope;

    protected static ?string $navigationLabel = 'Messages';

    protected static ?int $navigationSort = 6;

    public static function canCreate(): bool
    {
        return false;
    }

    public static function infolist(Schema $schema): Schema
    {
        return $schema->components([
            TextEntry::make('name'), TextEntry::make('email')->copyable(), TextEntry::make('topic'),
            TextEntry::make('message')->columnSpanFull(), // shown as text, never as HTML
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('name'), TextColumn::make('email')->searchable(), TextColumn::make('topic')->badge(),
                TextColumn::make('message')->limit(60),
                TextColumn::make('created_at')->dateTime('j M Y, H:i', 'Europe/London')->sortable(),
            ])
            ->filters([TernaryFilter::make('handled_at')->label('Handled')->nullable()->default(false)])
            ->recordActions([
                ViewAction::make(),
                Action::make('handled')->label('Mark handled')->visible(fn (ContactMessage $m) => ! $m->handled_at)
                    ->action(fn (ContactMessage $m) => $m->forceFill(['handled_at' => now()])->save()),
            ]);
    }

    public static function getPages(): array
    {
        return ['index' => ListContactMessages::route('/')];
    }
}
