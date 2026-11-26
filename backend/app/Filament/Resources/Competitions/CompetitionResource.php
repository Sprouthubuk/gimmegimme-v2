<?php

namespace App\Filament\Resources\Competitions;

use App\Filament\Resources\Competitions\Pages\CreateCompetition;
use App\Filament\Resources\Competitions\Pages\EditCompetition;
use App\Filament\Resources\Competitions\Pages\HuntBoard;
use App\Filament\Resources\Competitions\Pages\ListCompetitions;
use App\Filament\Support\Money;
use App\Models\BundleTier;
use App\Models\Competition;
use App\Models\CompetitionPrize;
use App\Models\HuntPrize;
use App\Services\Bundles;
use App\Services\CompetitionState;
use App\Services\DrawResults;
use App\Services\PromoCap;
use App\Services\Publishing;
use App\Support\GameIds;
use App\Support\PresenterKey;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Forms\Components\CheckboxList;
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
use Filament\Schemas\Components\Text;
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

    protected static string|\UnitEnum|null $navigationGroup = 'Competitions';

    public const GAMES = [
        'classic' => 'Classic reveal', 'scratch_card' => 'Scratch Card', 'spin_wheel' => 'Spin the Wheel', 'bingo_card' => 'Bingo Card', 'balloon_pop' => 'Balloon Pop',
        'hook_a_duck' => 'Hook a Duck', 'claw_machine' => 'Claw Machine', 'coin_drop' => 'Coin Drop', 'slots' => 'Slots', 'gems' => 'Gems',
        'whack_a_mole' => 'Whack-a-Mole', 'pinata' => 'Piñata',
    ];

    public static function form(Schema $schema): Schema
    {
        $locked = fn (?Competition $record) => $record?->verity_ref !== null;

        return $schema->components([
            Section::make('Competition')->columns(2)->components([
                TextInput::make('title')->required()->maxLength(120)->live(onBlur: true)
                    ->afterStateUpdated(fn (Set $set, Get $get, ?string $state, ?Competition $record) => $record ? null : $set('slug', Str::slug((string) $state))),
                TextInput::make('slug')->required()->maxLength(120)->alphaDash()->unique(ignoreRecord: true)->helperText('The web address: /competitions/slug'),
                Select::make('type')->options(['instant' => 'Instant win', 'draw' => 'Draw'])->required()->live()->disabled($locked)
                    // A new draw starts in the Gimme Box, a new instant-win game starts out of it (owner, 22 Nov 2026).
                    ->afterStateUpdated(fn (Set $set, ?string $state, ?Competition $record) => $record ? null : $set('gimme_box_enabled', $state === 'draw')),
                Select::make('game')->label('Reveal game')->options(self::GAMES)->live()->visible(fn (Get $get) => $get('type') === 'instant')->required(fn (Get $get) => $get('type') === 'instant'),
                // Presentation only: the result is decided before the game appears, whatever the skin.
                Select::make('skin')->label('Game skin')->options(GameIds::skinLabels())->default('classic')->required()->live()
                    ->helperText(fn (Get $get) => ($get('skin') ?? 'classic') !== 'classic' && $get('type') === 'instant' && $get('game') && ! GameIds::skinCovers($get('skin'), $get('game'))
                        ? 'This skin has no version of '.(self::GAMES[$get('game')] ?? $get('game')).': the classic look will play.'
                        : 'Changes how the reveal game looks, never the result.'),
                FileUpload::make('image')->image()->acceptedFileTypes(['image/jpeg', 'image/png', 'image/webp'])->disk('public')->directory('competitions')->imageEditor()->maxSize(4096)->required(),
                TextInput::make('subtitle')->maxLength(120)->helperText('Under the price, e.g. "£50 cash alternative". Leave empty for instant wins to show the number of prizes.'),
                Toggle::make('featured')->helperText('Shown first on the home page.'),
                TagsInput::make('tags'),
                Textarea::make('description')->rows(4)->columnSpanFull(),
                Textarea::make('how_to_play')->rows(3)->columnSpanFull(),
            ]),
            Section::make('Terms')->description('Fixed by Verity when the competition is published: they can’t change after that.')->columns(3)->components([
                Toggle::make('is_free')->label('Free to enter')->columnSpanFull()->live()->disabled($locked)
                    ->helperText('£0, one ticket per person. Signed-in players claim it on the competition page with the same checks as a purchase (18+, email confirmed, Safer Play). Works for live draws and instant wins.')
                    ->afterStateUpdated(function (Set $set, $state) {
                        if ($state) {
                            $set('price_pence', '0.00');
                            $set('max_per_person', 1);
                            $set('min_tickets', 1);
                            $set('bundles_enabled', false);
                            $set('gimme_box_enabled', false);
                            $set('hunt_theme_id', null);
                        }
                    }),
                Money::input('price_pence', 'Ticket price')->required()->disabled($locked)->readOnly(fn (Get $get) => (bool) $get('is_free'))->live(onBlur: true),
                TextInput::make('max_tickets')->label('Tickets')->integer()->minValue(1)->maxValue(10_000_000)->required()->disabled($locked)->live(onBlur: true),
                TextInput::make('max_per_person')->label('Max tickets per person')->integer()->minValue(1)->disabled($locked)->readOnly(fn (Get $get) => (bool) $get('is_free'))
                    ->lte('max_tickets')->helperText('Shown on the competition page and enforced at checkout. Leave empty for no limit.'),
                TextInput::make('min_tickets')->label('Minimum tickets per order')->integer()->minValue(1)->default(1)->required()->disabled($locked)
                    ->lte('max_tickets')->helperText('E.g. 100 on a 1p competition for a £1 minimum.'),
                DateTimePicker::make('opens_at')->label('Opens (UK time)')->timezone('Europe/London')->seconds(false)->disabled($locked),
                DateTimePicker::make('closes_at')->label('Closes (UK time)')->timezone('Europe/London')->seconds(false)->required()->after('now')->disabled($locked),
                Money::input('cash_alternative_pence', 'Cash alternative'),
                TagsInput::make('presets')->label('Ticket buttons')->placeholder('e.g. 50')->nestedRecursiveRules(['integer', 'min:1'])
                    ->helperText('Quick-pick amounts on the competition page. Empty: 5, 10, 25, 50 (1, 5, 10, 25 for draws).')->columnSpan(2),
                TextInput::make('popular_preset')->label('“Most popular” button')->integer()->minValue(1)->helperText('One of the ticket buttons, or empty.'),
            ]),
            Section::make('Bundles')->description('“Buy X Get Y Free” for live draws. Free tickets are entered exactly like paid ones. Players never see ticket counts.')
                ->visible(fn (Get $get) => $get('type') === 'draw')->columns(3)->components([
                    Toggle::make('bundles_enabled')->label('Sell bundles')->live()->columnSpanFull(),
                    CheckboxList::make('bundle_tier_ids')->label('Bundles offered')->live()
                        ->options(fn () => BundleTier::query()->where('is_active', true)->orderBy('sort_order')->get()->mapWithKeys(fn (BundleTier $t) => [$t->id => $t->displayLabel().' ('.$t->total().' tickets)'])->all())
                        ->columnSpan(2)->helperText('Manage the list under Competitions → Bundles.'),
                    Select::make('featured_bundle_tier_id')->label('Our Pick (preselected)')->live()
                        ->options(fn (Get $get) => BundleTier::query()->whereIn('id', (array) $get('bundle_tier_ids'))->orderBy('sort_order')->get()->mapWithKeys(fn (BundleTier $t) => [$t->id => $t->displayLabel()])->all())
                        ->helperText('Badged “Our Pick” and picked first on the page.'),
                    TextInput::make('max_bundle_share_pct')->label('Biggest bundle, % of tickets')->integer()->minValue(1)->maxValue(100)->default(10)->required()->suffix('%')->live(onBlur: true)
                        ->helperText('A bundle bigger than this share of the tickets is never sold, even if ticked.'),
                    Money::input('prize_cost_pence', 'Prize cost (admin only)')->live(onBlur: true),
                    Text::make(fn (Get $get, ?Competition $record) => self::marginText($get, $record))->columnSpanFull(),
                ]),
            Section::make('Gimme Box And Promo Tickets')->description('Whether the lucky-dip Gimme Box may put this competition in a box (prices stay the same as this page), and the most free promo tickets it can give.')
                ->visible(fn (Get $get) => in_array($get('type'), ['draw', 'instant'], true))->columns(2)->components([
                    Toggle::make('gimme_box_enabled')->label('Can go in a Gimme Box')->default(fn (Get $get) => $get('type') !== 'instant')
                        ->helperText(fn (Get $get) => $get('type') === 'instant' ? 'Paid tickets only: no bonus tickets on instant wins. Every box also has at least one live draw.' : null),
                    TextInput::make('gimme_box_weight')->label('How often it’s picked')->numeric()->minValue(0)->maxValue(5)->step(0.1)->default(1)->required()
                        ->helperText('1 is normal, 2 twice as often, 0 never. Slow sellers get a boost on top (Settings → Gimme Box).'),
                    TextInput::make('promo_ticket_cap_pct')->label('Promo ticket cap (% of tickets)')->numeric()->minValue(0)->maxValue(100)->step(0.5)->default(5)->required()
                        ->live(onBlur: true)->visible(fn (Get $get) => $get('type') === 'draw')
                        ->helperText('Referral voucher tickets and Gimme Box bonus tickets together never pass this. Free postal entries don’t count. Players never see the number.'),
                ]),
            Section::make('Mystery Hunt')->description('Optional. Add one instant prize of type “Hunt symbol” (worth £0) with as many as you want hidden. Each one found lets the player pick a number on the Hunt Board; Verity seals which prize is behind each number when you publish, and nobody can see the map until the hunt ends.')
                ->visible(fn (Get $get) => $get('type') === 'instant')->columns(2)->collapsible()->components([
                    Select::make('hunt_theme_id')->label('Hunt theme')->relationship('huntTheme', 'name')->live()->disabled($locked)
                        ->helperText('Empty: not a hunt. Themes are under Competitions → Hunt Themes.'),
                    TextInput::make('hunt_claim_hours')->label('Claim window (hours)')->integer()->minValue(1)->maxValue(336)->default(48)->required()
                        ->visible(fn (Get $get) => (bool) $get('hunt_theme_id')),
                    Repeater::make('huntPrizes')->relationship()->label('Prizes hidden behind the symbols')->visible(fn (Get $get) => (bool) $get('hunt_theme_id'))
                        ->disabled($locked)->orderColumn('sort')->columnSpanFull()->columns(4)->defaultItems(1)
                        ->components([
                            TextInput::make('name')->required()->maxLength(120),
                            Money::input('value_pence', 'Value')->required(),
                            Select::make('type')->options(HuntPrize::TYPES)->default('cash')->required(),
                            TextInput::make('quantity')->integer()->minValue(1)->required(),
                        ])
                        ->helperText('The quantities must add up to the number of hunt symbols. Cash goes to winnings; ticket credit to bonus (tickets only, expires).'),
                    Text::make(fn (Get $get) => self::huntText($get))->columnSpanFull()->visible(fn (Get $get) => (bool) $get('hunt_theme_id')),
                ]),
            Section::make('Prizes')->columns(2)->components([
                TextInput::make('end_prize_name')->label(fn (Get $get) => $get('type') === 'instant' ? 'End prize (optional draw at the close)' : 'Prize')
                    ->required(fn (Get $get) => $get('type') === 'draw')->maxLength(120)->disabled($locked),
                Money::input('end_prize_value_pence', 'Prize value')->disabled($locked),
                TextInput::make('end_prize_count')->label('How many winners')->integer()->minValue(1)->maxValue(Publishing::MAX_END_PRIZES)->default(1)->required()
                    ->disabled($locked)->helperText('Each wins the prize above. One person can win more than one.'),
                Select::make('end_prize_type')->label('How the end prize is paid')->options(Competition::END_PRIZE_TYPES)->default('physical')->required()->disabled($locked),
                Repeater::make('prizes')->relationship()->label('Instant-win prizes')->visible(fn (Get $get) => $get('type') === 'instant')
                    ->disabled($locked)->orderColumn('sort')->columnSpanFull()->columns(4)->defaultItems(1)
                    ->components([
                        TextInput::make('name')->required()->maxLength(120),
                        Money::input('value_pence', 'Value')->required(),
                        Select::make('type')->options(fn (Get $get) => $get('../../hunt_theme_id')
                            ? CompetitionPrize::TYPES : array_intersect_key(CompetitionPrize::TYPES, array_flip(CompetitionPrize::TYPES_FOR['instant'])))->default('site_credit')->required(),
                        TextInput::make('quantity')->integer()->minValue(1)->required(),
                    ])
                    ->helperText('Cash and site credit go to the winner’s winnings balance instantly. Which ticket wins each prize is decided by Verity at publish, from its committed seed.'),
            ]),
        ]);
    }

    /** The hunt's prize picture as the admin types: fund, cash against credit, odds and break-even (before card fees). */
    public static function huntText(Get $get): string
    {
        $price = Money::toPence((string) ($get('price_pence') ?? '0'));
        $tickets = (int) $get('max_tickets');
        $instant = collect((array) $get('prizes'));
        $hidden = collect((array) $get('huntPrizes'));
        $pence = fn ($row) => Money::toPence((string) ($row['value_pence'] ?? '0')) * (int) ($row['quantity'] ?? 0);
        $symbols = (int) $instant->where('type', 'hunt_symbol')->sum(fn ($r) => (int) ($r['quantity'] ?? 0));
        $hiddenCount = (int) $hidden->sum(fn ($r) => (int) ($r['quantity'] ?? 0));
        $wins = (int) $instant->sum(fn ($r) => (int) ($r['quantity'] ?? 0));
        $cash = (int) $instant->whereIn('type', ['cash', 'site_credit'])->sum($pence) + (int) $hidden->where('type', 'cash')->sum($pence);
        $credit = (int) $instant->where('type', 'ticket_credit')->sum($pence) + (int) $hidden->where('type', 'ticket_credit')->sum($pence);
        $end = Money::toPence((string) ($get('end_prize_value_pence') ?? '0')) * max(1, (int) ($get('end_prize_count') ?: 1)) * ($get('end_prize_name') ? 1 : 0);
        $fund = $cash + $credit + $end;
        $text = 'Hunt: '.$symbols.' symbols, '.$hiddenCount.' hidden prizes'.($symbols !== $hiddenCount ? ' ⚠ they must match' : '')
            .' · Prize fund '.Money::show($fund).' (cash '.Money::show($cash + $end).', credit '.Money::show($credit).')';
        if ($price > 0 && $tickets > 0) {
            $text .= ' · Sell-out '.Money::show($price * $tickets).($wins > 0 ? ' · 1 in '.number_format($tickets / $wins, 1).' wins instantly' : '')
                .' · Break-even about '.number_format((int) ceil($fund / $price)).' tickets, before card fees';
        }

        return $text.'. Symbols nobody claims in time aren’t won, so this is the most that can be paid.';
    }

    /**
     * The worst-case money picture, worked out again as the admin types: every ticket sold in the biggest
     * bundle that may be sold, one order each, with Cashflows' 1.6% + 15p.
     */
    public static function marginText(Get $get, ?Competition $record = null): string
    {
        $price = Money::toPence((string) ($get('price_pence') ?? '0'));
        $tickets = (int) $get('max_tickets');
        $cost = ($c = $get('prize_cost_pence')) !== null && $c !== '' ? Money::toPence((string) $c) : null;
        if ($price < 1 || $tickets < 1) {
            return 'Margin preview: enter the ticket price and number of tickets.';
        }
        $limit = intdiv($tickets * max(1, min(100, (int) ($get('max_bundle_share_pct') ?: 10))), 100);
        $tiers = $get('bundles_enabled') ? BundleTier::query()->whereIn('id', (array) $get('bundle_tier_ids'))->where('is_active', true)->get()
            ->filter(fn (BundleTier $t) => $t->total() <= $limit)->map(fn (BundleTier $t) => ['paid' => $t->paid_qty, 'free' => $t->free_qty])->values()->all() : [];
        $m = Bundles::margin($price, $tickets, $cost, $tiers);
        $line = 'Sell-out on single tickets: '.Money::show($m['singlesRevenuePence'])
            .' · Worst case (all in the biggest bundle): '.Money::show($m['worstRevenuePence']).' less fees '.Money::show($m['worstFeesPence']);
        if ($m['worstProfitPence'] === null) {
            return $line.'. Add the prize cost to see the profit.';
        }
        $profit = ' · Prize '.Money::show($m['prizeCostPence']).' · Worst-case profit '.Money::show($m['worstProfitPence'])
            .' · Break-even '.($m['breakEvenTickets'] === null ? 'never' : number_format($m['breakEvenTickets']).' tickets');

        return $line.$profit.($m['worstProfitPence'] < 0 ? '  ⚠ LOSS in the worst case: use smaller bundles, a lower share limit or a higher price.' : '')
            .self::boxBonusText($get, $record, $price, $tickets, $cost, $tiers);
    }

    /**
     * Promo tickets (referral vouchers + Gimme Box bonus, PromoCap): how many so far against the cap, and
     * the worst case if the whole cap is given away on top of the worst bundle mix.
     */
    private static function boxBonusText(Get $get, ?Competition $record, int $price, int $tickets, ?int $cost, array $tiers): string
    {
        $pct = max(0.0, min(100.0, (float) ($get('promo_ticket_cap_pct') ?? 5)));
        $cap = (int) floor($tickets * $pct / 100);
        $used = $record ? PromoCap::used($record) : 0;
        $text = ' · Promo tickets: '.number_format($used).' of cap '.number_format($cap);
        if ($cap === 0 || $tickets <= $cap) {
            return $text;
        }
        $b = Bundles::margin($price, $tickets - $cap, $cost, $tiers);

        return $text.' · Worst case with the whole cap given away: '.Money::show($b['worstRevenuePence'])
            .($b['worstProfitPence'] === null ? '' : ', profit '.Money::show($b['worstProfitPence']).($b['worstProfitPence'] < 0 ? ' ⚠ LOSS' : ''));
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
                TextColumn::make('price_pence')->label('Price')->formatStateUsing(fn ($state, Competition $record) => $record->isFree() ? 'Free' : Money::show($state)),
                TextColumn::make('closes_at')->label('Closes')->dateTime('D j M Y, H:i', 'Europe/London')->sortable(),
                TextColumn::make('verity_ref')->label('Verity')->placeholder('Not published')->copyable(),
            ])
            ->filters([SelectFilter::make('type')->options(['instant' => 'Instant win', 'draw' => 'Draw'])])
            ->recordActions([
                EditAction::make(),
                self::publishAction(),
                self::openNowAction(),
                self::previewGameAction(),
                self::liveDrawAction(),
                self::publishResultAction(),
                self::huntBoardAction(),
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

    /** A published competition with an opening time still to come goes on sale now (Publishing::openNow). */
    public static function openNowAction(): Action
    {
        return Action::make('openNow')->label('Open Now')->icon(Heroicon::OutlinedLockOpen)->color('warning')
            ->visible(fn (Competition $record) => $record->verity_ref !== null && $record->opens_at?->isFuture())
            ->requiresConfirmation()
            ->modalHeading('Open this competition now?')
            ->modalDescription(fn (Competition $record) => 'It is set to open '.$record->opens_at->timezone('Europe/London')->format('D j M, g:ia')
                .'. Opening now puts it on sale straight away (while the sales switch is on). The price, tickets, prizes and closing date stay exactly as published. This can’t be undone.')
            ->schema([Textarea::make('reason')->label('Reason')->required()->maxLength(300)])
            ->action(function (Competition $record, array $data) {
                try {
                    app(Publishing::class)->openNow($record, auth()->user(), $data['reason']);
                } catch (\Throwable $e) {
                    Notification::make()->danger()->title('Not opened')->body($e->getMessage())->send();

                    return;
                }
                Notification::make()->success()->title('Open now')->body($record->title.' is on sale.')->send();
            });
    }

    /** Plays this competition's reveal game, in its skin, with made-up tickets (the public /demo page; nothing is bought). */
    public static function previewGameAction(): Action
    {
        return Action::make('previewGame')->label('Preview Game')->icon(Heroicon::OutlinedPlay)->color('info')
            ->visible(fn (Competition $record) => $record->isInstant() && $record->game)
            ->url(fn (Competition $record) => '/demo/'.$record->game.'?'.http_build_query(['skin' => $record->skin ?? 'classic']), shouldOpenInNewTab: true);
    }

    /** The live-stream draw screen for a published draw: share that tab on the stream and press "Reveal Winner". */
    public static function liveDrawAction(): Action
    {
        return Action::make('liveDraw')->label('Live Draw Screen')->icon(Heroicon::OutlinedVideoCamera)->color('danger')
            ->visible(fn (Competition $record) => $record->verity_ref !== null && $record->hasDraw())
            // The presenter key lets this screen see a held result and publish it (PresenterKey, two days).
            ->url(fn (Competition $record) => '/live-draw/'.$record->slug.'?key='.PresenterKey::make($record, auth()->user()), shouldOpenInNewTab: true);
    }

    /** Publish a held draw result: shown everywhere, winners paid and emailed (DrawResults). The screen can do the same. */
    public static function publishResultAction(): Action
    {
        return Action::make('publishResult')->label('Publish Result')->icon(Heroicon::OutlinedMegaphone)->color('success')
            ->visible(fn (Competition $record) => DrawResults::held($record))
            ->requiresConfirmation()
            ->modalHeading('Publish this draw’s result?')
            ->modalDescription('The winner is shown on the site and in their account, emailed, and paid if the prize is site credit. Do this once the live reveal is done. It can’t be undone.')
            ->action(function (Competition $record) {
                $done = app(DrawResults::class)->publish($record, auth()->user(), 'admin');
                $done ? Notification::make()->success()->title('Result published')->body($record->title.': winners told.')->send()
                    : Notification::make()->warning()->title('Nothing to publish')->body('It isn’t drawn yet, or it’s already published.')->send();
            });
    }

    /** The Hunt Board: enter the number a player picked, open that one prize, pay it (Hunts::pick). */
    public static function huntBoardAction(): Action
    {
        return Action::make('huntBoard')->label('Hunt Board')->icon(Heroicon::OutlinedMap)->color('warning')
            ->visible(fn (Competition $record) => $record->verity_ref !== null && $record->isHunt())
            ->url(fn (Competition $record) => HuntBoard::getUrl(['record' => $record]));
    }

    public static function getPages(): array
    {
        return [
            'hunt' => HuntBoard::route('/{record}/hunt'),
            'index' => ListCompetitions::route('/'),
            'create' => CreateCompetition::route('/create'),
            'edit' => EditCompetition::route('/{record}/edit'),
        ];
    }
}
