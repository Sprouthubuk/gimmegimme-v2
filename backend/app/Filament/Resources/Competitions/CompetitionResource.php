<?php

namespace App\Filament\Resources\Competitions;

use App\Filament\Resources\Competitions\Pages\CreateCompetition;
use App\Filament\Resources\Competitions\Pages\EditCompetition;
use App\Filament\Resources\Competitions\Pages\ListCompetitions;
use App\Filament\Support\Money;
use App\Models\Competition;
use App\Services\CompetitionState;
use App\Services\Publishing;
use App\Support\GameIds;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\Repeater;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\Utilities\Get;
use Filament\Schemas\Components\Utilities\Set;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\ImageColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Support\Str;

class CompetitionResource extends Resource
{
    protected static ?string $model = Competition::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedTrophy;

    protected static ?string $recordTitleAttribute = 'title';

    protected static ?int $navigationSort = 1;

    public const GAMES = [
        'classic' => 'Classic reveal', 'scratch_card' => 'Scratch Card', 'spin_wheel' => 'Spin the Wheel', 'bingo_card' => 'Bingo Card', 'balloon_pop' => 'Balloon Pop',
        'hook_a_duck' => 'Hook a Duck', 'claw_machine' => 'Claw Machine', 'coin_drop' => 'Coin Drop', 'slots' => 'Slots', 'gems' => 'Gems',
    ];

    public static function form(Schema $schema): Schema
    {
        $locked = fn (?Competition $record) => $record?->verity_ref !== null;

        return $schema->components([
            Section::make('Competition')->columns(2)->components([
                TextInput::make('title')->required()->maxLength(120)->live(onBlur: true)
                    ->afterStateUpdated(fn (Set $set, Get $get, ?string $state, ?Competition $record) => $record ? null : $set('slug', Str::slug((string) $state))),
                TextInput::make('slug')->required()->maxLength(120)->alphaDash()->unique(ignoreRecord: true)->helperText('The web address: /competitions/slug'),
                Select::make('type')->options(['instant' => 'Instant win', 'draw' => 'Draw'])->required()->live()->disabled($locked),
                Select::make('game')->label('Reveal game')->options(self::GAMES)->live()->visible(fn (Get $get) => $get('type') === 'instant')->required(fn (Get $get) => $get('type') === 'instant'),
                // Presentation only: the result is decided before the game appears, whatever the skin.
                Select::make('skin')->label('Game skin')->options(GameIds::skinLabels())->default('classic')->required()->live()
                    ->helperText(fn (Get $get) => ($get('skin') ?? 'classic') !== 'classic' && $get('type') === 'instant' && $get('game') && ! GameIds::skinCovers($get('skin'), $get('game'))
                        ? 'This skin has no version of '.(self::GAMES[$get('game')] ?? $get('game')).': the classic look will play.'
                        : 'Changes how the reveal game looks, never the result.'),
                FileUpload::make('image')->image()->disk('public')->directory('competitions')->imageEditor()->maxSize(4096)->required(),
                TextInput::make('subtitle')->maxLength(120)->helperText('Under the price, e.g. "£50 cash alternative". Leave empty for instant wins to show the number of prizes.'),
                Toggle::make('featured')->helperText('Shown first on the home page.'),
                TagsInput::make('tags'),
                Textarea::make('description')->rows(4)->columnSpanFull(),
                Textarea::make('how_to_play')->rows(3)->columnSpanFull(),
            ]),
            Section::make('Terms')->description('Fixed by Verity when the competition is published: they can’t change after that.')->columns(3)->components([
                Money::input('price_pence', 'Ticket price')->required()->disabled($locked),
                TextInput::make('max_tickets')->label('Tickets')->integer()->minValue(1)->maxValue(10_000_000)->required()->disabled($locked),
                TextInput::make('max_per_person')->label('Tickets per person')->integer()->minValue(1)->required()->disabled($locked)
                    ->lte('max_tickets'),
                TextInput::make('min_tickets')->label('Minimum tickets per order')->integer()->minValue(1)->default(1)->required()->disabled($locked)
                    ->lte('max_per_person')->helperText('E.g. 100 on a 1p competition for a £1 minimum.'),
                DateTimePicker::make('opens_at')->label('Opens (UK time)')->timezone('Europe/London')->seconds(false)->disabled($locked),
                DateTimePicker::make('closes_at')->label('Closes (UK time)')->timezone('Europe/London')->seconds(false)->required()->after('now')->disabled($locked),
                Money::input('cash_alternative_pence', 'Cash alternative'),
                TagsInput::make('presets')->label('Ticket buttons')->placeholder('e.g. 50')->nestedRecursiveRules(['integer', 'min:1'])
                    ->helperText('Quick-pick amounts on the competition page. Empty: 5, 10, 25, 50 (1, 5, 10, 25 for draws).')->columnSpan(2),
                TextInput::make('popular_preset')->label('“Most popular” button')->integer()->minValue(1)->helperText('One of the ticket buttons, or empty.'),
            ]),
            Section::make('Prizes')->columns(2)->components([
                TextInput::make('end_prize_name')->label(fn (Get $get) => $get('type') === 'instant' ? 'End prize (optional draw at the close)' : 'Prize')
                    ->required(fn (Get $get) => $get('type') === 'draw')->maxLength(120)->disabled($locked),
                Money::input('end_prize_value_pence', 'Prize value')->disabled($locked),
                TextInput::make('end_prize_count')->label('How many winners')->integer()->minValue(1)->maxValue(Publishing::MAX_END_PRIZES)->default(1)->required()
                    ->disabled($locked)->helperText('Each wins the prize above. One end prize per person: a repeat win is redrawn.'),
                Select::make('end_prize_type')->label('How the end prize is paid')->options(Competition::END_PRIZE_TYPES)->default('physical')->required()->disabled($locked),
                Repeater::make('prizes')->relationship()->label('Instant-win prizes')->visible(fn (Get $get) => $get('type') === 'instant')
                    ->disabled($locked)->orderColumn('sort')->columnSpanFull()->columns(4)->defaultItems(1)
                    ->components([
                        TextInput::make('name')->required()->maxLength(120),
                        Money::input('value_pence', 'Value')->required(),
                        Select::make('type')->options(['site_credit' => 'Site credit', 'cash' => 'Cash', 'physical' => 'Physical (sent by hand)'])->default('site_credit')->required(),
                        TextInput::make('quantity')->integer()->minValue(1)->required(),
                    ])
                    ->helperText('Cash and site credit go to the winner’s winnings balance instantly. Which ticket wins each prize is decided by Verity at publish, from its committed seed.'),
            ]),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('closes_at', 'desc')
            ->columns([
                ImageColumn::make('image')->disk('public')->square(),
                TextColumn::make('title')->searchable()->wrap(),
                TextColumn::make('type')->badge(),
                // Not yet handed to Verity: a draft, whatever its dates say.
                TextColumn::make('status')->badge()->state(fn (Competition $c) => $c->verity_ref === null ? 'draft' : app(CompetitionState::class)->status($c))
                    ->color(fn (string $state) => ['draft' => 'gray', 'live' => 'success', 'scheduled' => 'info', 'sold_out' => 'warning', 'closed' => 'warning', 'drawn' => 'info', 'ended' => 'gray'][$state] ?? 'gray'),
                TextColumn::make('sold')->state(fn (Competition $c) => app(CompetitionState::class)->sold($c).' / '.number_format($c->max_tickets)),
                TextColumn::make('price_pence')->label('Price')->formatStateUsing(fn ($state) => Money::show($state)),
                TextColumn::make('closes_at')->label('Closes')->dateTime('D j M Y, H:i', 'Europe/London')->sortable(),
                TextColumn::make('verity_ref')->label('Verity')->placeholder('Not published')->copyable(),
            ])
            ->filters([SelectFilter::make('type')->options(['instant' => 'Instant win', 'draw' => 'Draw'])])
            ->recordActions([
                EditAction::make(),
                self::publishAction(),
            ]);
    }

    public static function publishAction(): Action
    {
        return Action::make('publish')->label('Publish')->icon(Heroicon::OutlinedRocketLaunch)->color('success')
            ->visible(fn (Competition $record) => $record->verity_ref === null)
            ->requiresConfirmation()
            ->modalDescription('Publishing hands the terms and prizes to Verity, which fixes them and commits to the draw. They can’t be changed afterwards.')
            ->action(function (Competition $record) {
                $problems = app(Publishing::class)->problems($record);
                if ($problems) {
                    Notification::make()->danger()->title('Not published')->body(implode(' ', $problems))->send();

                    return;
                }
                app(Publishing::class)->publish($record, auth()->user());
                Notification::make()->success()->title('Published to Verity')->body($record->refresh()->verity_ref)->send();
            });
    }

    public static function getPages(): array
    {
        return [
            'index' => ListCompetitions::route('/'),
            'create' => CreateCompetition::route('/create'),
            'edit' => EditCompetition::route('/{record}/edit'),
        ];
    }
}
