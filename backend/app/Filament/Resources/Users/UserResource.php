<?php

namespace App\Filament\Resources\Users;

use App\Filament\Resources\Users\Pages\EditUser;
use App\Filament\Resources\Users\Pages\ListUsers;
use App\Filament\Support\Money;
use App\Models\AdminAction;
use App\Models\User;
use App\Services\Settings;
use App\Services\Wallet;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\ActionGroup;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;
use Illuminate\Support\Str;

/** Players. Accounts are never deleted; money and holds change only through the actions here, each with a reason. */
class UserResource extends Resource
{
    protected static ?string $model = User::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedUsers;

    protected static ?string $navigationLabel = 'Players';

    protected static ?string $modelLabel = 'player';

    protected static ?int $navigationSort = 3;

    public const MAX_ADJUST_PENCE = 50000;

    public static function canCreate(): bool
    {
        return false;
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            Section::make('Details')->columns(2)->components([
                TextInput::make('first_name')->required()->maxLength(60),
                TextInput::make('last_name')->required()->maxLength(60),
                TextInput::make('email')->disabled(),
                DatePicker::make('date_of_birth')->required()->before(now()->subYears(18)),
                TextInput::make('phone')->maxLength(30),
                TextInput::make('address_line1')->maxLength(120),
                TextInput::make('address_line2')->maxLength(120),
                TextInput::make('city')->maxLength(80),
                TextInput::make('postcode')->maxLength(12),
            ]),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('first_name')->label('Name')->formatStateUsing(fn ($state, User $u) => $u->first_name.' '.$u->last_name)->searchable(['first_name', 'last_name']),
                TextColumn::make('email')->searchable()->copyable(),
                TextColumn::make('wallet')->state(fn (User $u) => Money::show(app(Wallet::class)->total($u))),
                IconColumn::make('email_verified_at')->label('Email')->boolean()->state(fn (User $u) => $u->email_verified_at !== null),
                IconColumn::make('id_verified_at')->label('ID')->boolean()->state(fn (User $u) => $u->id_verified_at !== null),
                TextColumn::make('flags')->badge()->separator(',')->state(fn (User $u) => array_values(array_filter([
                    $u->is_admin ? 'admin' : null, $u->is_staff ? 'staff' : null, $u->on_hold_at ? 'on hold' : null, $u->closed_at ? 'closed' : null,
                    $u->self_excluded_until?->isFuture() ? 'self-excluded' : null, $u->cool_off_until?->isFuture() ? 'break' : null,
                ]))),
                TextColumn::make('created_at')->label('Joined')->date('j M Y', 'Europe/London')->sortable(),
            ])
            ->filters([
                TernaryFilter::make('on_hold_at')->label('On hold')->nullable(),
                TernaryFilter::make('is_staff')->label('Staff'),
            ])
            ->recordActions([
                EditAction::make(),
                ActionGroup::make([
                    self::reasoned('hold', 'Put on hold', fn (User $u) => ! $u->on_hold_at, function (User $u, string $reason) {
                        $u->forceFill(['on_hold_at' => now(), 'on_hold_reason' => $reason])->save();
                    }),
                    self::reasoned('release', 'Release hold', fn (User $u) => (bool) $u->on_hold_at, function (User $u) {
                        $u->forceFill(['on_hold_at' => null, 'on_hold_reason' => null])->save();
                    }),
                    self::reasoned('id_verified', 'Mark ID checked', fn (User $u) => ! $u->id_verified_at, function (User $u) {
                        $u->forceFill(['id_verified_at' => now()])->save();
                    }),
                    self::reasoned('staff', 'Mark as staff (can’t play)', fn (User $u) => ! $u->is_staff, function (User $u) {
                        $u->forceFill(['is_staff' => true])->save();
                    }),
                    self::reasoned('verify_email', 'Confirm email by hand', fn (User $u) => ! $u->email_verified_at, function (User $u) {
                        $u->markEmailAsVerified();
                    }),
                    Action::make('credit')->label('Add wallet credit')->icon(Heroicon::OutlinedBanknotes)
                        ->visible(fn (User $u) => $u->id !== auth()->id() && ! $u->is_admin && ! $u->is_staff)
                        ->schema([
                            Select::make('bucket')->options(['bonus' => 'Bonus (expires)', 'deposit' => 'Deposit', 'winnings' => 'Winnings (withdrawable)'])->default('bonus')->required(),
                            Money::input('amount', 'Amount')->required(),
                            Textarea::make('reason')->required()->maxLength(300),
                            TextInput::make('confirm')->label('Type the amount again to confirm, e.g. ADD 5.00')->required(),
                        ])
                        ->action(function (User $u, array $data) {
                            $pence = (int) $data['amount'];
                            if ($pence < 1 || $pence > self::MAX_ADJUST_PENCE || trim(strtoupper($data['confirm'])) !== 'ADD '.number_format($pence / 100, 2, '.', '')) {
                                Notification::make()->danger()->title('Not added')->body('Between £0.01 and '.Money::show(self::MAX_ADJUST_PENCE).', confirmed exactly.')->send();

                                return;
                            }
                            $ref = 'admin:'.Str::uuid();
                            app(Wallet::class)->credit($u, $data['bucket'], $pence, 'Added by us · '.mb_substr($data['reason'], 0, 80), $ref, null,
                                $data['bucket'] === 'bonus' ? now()->addDays(Settings::bonusExpiryDays()) : null);
                            AdminAction::record(auth()->user(), 'wallet.credit', (string) $u->id, $data['reason'], ['bucket' => $data['bucket'], 'pence' => $pence, 'ref' => $ref]);
                            Notification::make()->success()->title(Money::show($pence).' added')->send();
                        }),
                ]),
            ]);
    }

    private static function reasoned(string $name, string $label, \Closure $visible, \Closure $do): Action
    {
        return Action::make($name)->label($label)->visible($visible)->requiresConfirmation()
            ->schema([Textarea::make('reason')->required()->maxLength(300)])
            ->action(function (User $record, array $data) use ($name, $do) {
                $do($record, $data['reason']);
                AdminAction::record(auth()->user(), 'player.'.$name, (string) $record->id, $data['reason']);
                Notification::make()->success()->title('Done')->send();
            });
    }

    public static function getPages(): array
    {
        return ['index' => ListUsers::route('/'), 'edit' => EditUser::route('/{record}/edit')];
    }
}
