<?php

namespace App\Filament\Resources\Withdrawals;

use App\Filament\Resources\Withdrawals\Pages\ListWithdrawals;
use App\Filament\Support\Money;
use App\Models\AdminAction;
use App\Models\Withdrawal;
use App\Services\Wallet;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Forms\Components\Textarea;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Support\Facades\DB;

/** Winnings withdrawals: the money left the wallet when requested; an admin pays it, or rejects it and it goes back. */
class WithdrawalResource extends Resource
{
    protected static ?string $model = Withdrawal::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedBuildingLibrary;

    protected static ?int $navigationSort = 4;

    public static function canCreate(): bool
    {
        return false;
    }

    public static function getNavigationBadge(): ?string
    {
        $n = Withdrawal::query()->where('status', 'requested')->count();

        return $n ? (string) $n : null;
    }

    public static function table(Table $table): Table
    {
        return $table->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('user.email')->label('Player')->searchable(),
                TextColumn::make('amount_pence')->label('Amount')->formatStateUsing(fn ($state) => Money::show($state)),
                TextColumn::make('status')->badge()->color(fn ($state) => ['requested' => 'warning', 'paid' => 'success', 'rejected' => 'danger'][$state] ?? 'gray'),
                TextColumn::make('note')->wrap(),
                TextColumn::make('created_at')->label('Requested')->dateTime('j M Y, H:i', 'Europe/London')->sortable(),
            ])
            ->filters([SelectFilter::make('status')->options(['requested' => 'Requested', 'paid' => 'Paid', 'rejected' => 'Rejected'])])
            ->recordActions([
                Action::make('paid')->label('Mark paid')->color('success')->visible(fn (Withdrawal $w) => $w->status === 'requested')
                    ->schema([Textarea::make('note')->label('Bank transfer reference')->required()->maxLength(300)])
                    ->action(fn (Withdrawal $w, array $data) => self::decide($w, 'paid', $data['note'])),
                Action::make('reject')->label('Reject and return')->color('danger')->visible(fn (Withdrawal $w) => $w->status === 'requested')
                    ->schema([Textarea::make('note')->label('Why (the player can be told this)')->required()->maxLength(300)])
                    ->action(fn (Withdrawal $w, array $data) => self::decide($w, 'rejected', $data['note'])),
            ]);
    }

    private static function decide(Withdrawal $w, string $status, string $note): void
    {
        DB::transaction(function () use ($w, $status, $note) {
            $w = Withdrawal::query()->lockForUpdate()->findOrFail($w->id);
            if ($w->status !== 'requested') {
                return;
            }
            if ($w->user_id === auth()->id()) {
                throw new \DomainException('You can’t decide your own withdrawal.');
            }
            $w->forceFill(['status' => $status, 'note' => $note, 'decided_by' => auth()->id(), 'decided_at' => now()])->save();
            if ($status === 'rejected') {
                app(Wallet::class)->credit($w->user_id, 'winnings', $w->amount_pence, 'Withdrawal returned', 'withdrawal:'.$w->id.':returned');
            }
            AdminAction::record(auth()->user(), 'withdrawal.'.$status, $w->id, $note, ['pence' => $w->amount_pence]);
        });
        Notification::make()->success()->title('Withdrawal '.$status)->send();
    }

    public static function getPages(): array
    {
        return ['index' => ListWithdrawals::route('/')];
    }
}
