<?php

namespace App\Filament\Resources\HuntThemes;

use App\Filament\Resources\HuntThemes\Pages\CreateHuntTheme;
use App\Filament\Resources\HuntThemes\Pages\EditHuntTheme;
use App\Filament\Resources\HuntThemes\Pages\ListHuntThemes;
use App\Models\HuntTheme;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Forms\Components\ColorPicker;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\ImageColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

/** Reusable Mystery Hunt looks and wording (docs/mystery-hunt.md). A competition picks one before it's published. */
class HuntThemeResource extends Resource
{
    protected static ?string $model = HuntTheme::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedSparkles;

    protected static ?string $navigationLabel = 'Hunt Themes';

    protected static ?int $navigationSort = 3;

    protected static string|\UnitEnum|null $navigationGroup = 'Competitions';

    public static function form(Schema $schema): Schema
    {
        return $schema->columns(2)->components([
            TextInput::make('name')->required()->maxLength(80)->helperText('For the admin, e.g. “Christmas Baubles”.'),
            TextInput::make('symbol_name')->label('Symbol (one)')->required()->maxLength(60)->placeholder('Mystery Bauble'),
            TextInput::make('symbol_plural')->label('Symbol (more than one)')->required()->maxLength(60)->placeholder('Mystery Baubles'),
            TextInput::make('hashtag')->maxLength(60)->placeholder('#BaubleHunt')->regex('/^#[A-Za-z0-9_]+$/'),
            TextInput::make('facebook_url')->label('Facebook group link')->url()->maxLength(300)->startsWith(['https://www.facebook.com/', 'https://facebook.com/'])
                ->helperText('Where players post their number. Empty: claims by email or the contact form only.'),
            FileUpload::make('symbol_image')->label('Symbol artwork')->image()->acceptedFileTypes(['image/png', 'image/webp', 'image/svg+xml'])->disk('public')->directory('hunts')->maxSize(2048),
            ColorPicker::make('board_colour')->label('Board colour')->default('#0B3D2E')->required(),
            ColorPicker::make('accent_colour')->label('Accent colour')->default('#FFD23F')->required(),
            Textarea::make('intro')->label('Intro on the competition page')->rows(3)->maxLength(600)->columnSpanFull(),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table->columns([
            ImageColumn::make('symbol_image')->disk('public')->square(),
            TextColumn::make('name')->searchable(),
            TextColumn::make('symbol_name')->label('Symbol'),
            TextColumn::make('hashtag'),
        ])->recordActions([
            EditAction::make(),
            Action::make('duplicate')->label('Duplicate')->icon(Heroicon::OutlinedDocumentDuplicate)
                ->action(function (HuntTheme $record) {
                    $copy = $record->replicate();
                    $copy->name = mb_substr($record->name.' (copy)', 0, 80);
                    $copy->save();
                    Notification::make()->success()->title('Duplicated')->body($copy->name)->send();
                }),
        ]);
    }

    public static function getPages(): array
    {
        return ['index' => ListHuntThemes::route('/'), 'create' => CreateHuntTheme::route('/create'), 'edit' => EditHuntTheme::route('/{record}/edit')];
    }
}
