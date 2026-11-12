<?php

namespace App\Filament\Resources\Pages;

use App\Filament\Resources\Pages\Pages\CreatePage;
use App\Filament\Resources\Pages\Pages\EditPage;
use App\Filament\Resources\Pages\Pages\ListPages;
use App\Models\Page;
use BackedEnum;
use Filament\Actions\EditAction;
use Filament\Forms\Components\RichEditor;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

/** Terms, privacy, cookies, complaints and free entry: the legal pages the site shows. */
class PageResource extends Resource
{
    protected static ?string $model = Page::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedDocumentText;

    protected static ?string $navigationLabel = 'Legal pages';

    protected static ?int $navigationSort = 8;

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            Select::make('slug')->options(['terms' => 'Terms & Conditions', 'privacy' => 'Privacy Policy', 'cookies' => 'Cookie Policy', 'complaints' => 'Complaints', 'free-entry' => 'Free Entry Terms', 'rules' => 'Competition Rules'])
                ->required()->disabledOn('edit')->unique(ignoreRecord: true),
            TextInput::make('title')->required()->maxLength(120),
            TextInput::make('version')->required()->maxLength(20)->helperText('Change this whenever the wording changes.'),
            RichEditor::make('html')->label('Wording')->required()->columnSpanFull()
                ->toolbarButtons([['bold', 'italic', 'link'], ['h2', 'h3'], ['bulletList', 'orderedList'], ['undo', 'redo']]),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table->columns([
            TextColumn::make('title'), TextColumn::make('slug'), TextColumn::make('version'),
            TextColumn::make('updated_at')->dateTime('j M Y', 'Europe/London'),
        ])->recordActions([EditAction::make()]);
    }

    public static function getPages(): array
    {
        return ['index' => ListPages::route('/'), 'create' => CreatePage::route('/create'), 'edit' => EditPage::route('/{record}/edit')];
    }
}
