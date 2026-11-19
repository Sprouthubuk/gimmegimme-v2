<?php

namespace App\Filament\Resources\Referrals;

use App\Filament\Resources\Referrals\Pages\ListReferrals;
use App\Models\AdminAction;
use App\Models\Referral;
use App\Services\Referrals;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Forms\Components\Textarea;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

/**
 * Refer a Friend: every referral, with the review queue (flagged ones) at the top. Approve gives both
 * rewards (subject to the monthly cap); reject gives none. Both need a reason and are logged.
 */
class ReferralResource extends Resource
{
    protected static ?string $model = Referral::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedUserPlus;

    protected static ?int $navigationSort = 8;

    protected static string|\UnitEnum|null $navigationGroup = 'Marketing';

    public const STATUSES = ['pending' => 'Joined, no order yet', 'review' => 'Needs review', 'rewarded' => 'Rewarded', 'capped' => 'Friend only (monthly cap)',
        'blocked' => 'Blocked (fraud check)', 'missed' => 'Did not qualify', 'rejected' => 'Rejected', 'clawed_back' => 'Taken back (refund)'];

    public static function getNavigationBadge(): ?string
    {
        $n = Referral::query()->where('status', 'review')->count();

        return $n ? (string) $n : null;
    }

    /** The review queue first, then newest. */
    public static function getEloquentQuery(): Builder
    {
        return parent::getEloquentQuery()->with(['referrer:id,first_name,last_name,email', 'friend:id,first_name,last_name,email'])
            ->orderByRaw("case when status = 'review' then 0 else 1 end")->orderByDesc('created_at');
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('created_at')->label('Joined')->dateTime('j M Y, H:i', 'Europe/London'),
                TextColumn::make('referrer.email')->label('Referrer')->searchable()->description(fn (Referral $r) => $r->referrer?->first_name.' '.$r->referrer?->last_name),
                TextColumn::make('friend.email')->label('Friend')->searchable()->description(fn (Referral $r) => $r->friend?->first_name.' '.$r->friend?->last_name),
                TextColumn::make('status')->badge()->formatStateUsing(fn (string $state) => self::STATUSES[$state] ?? $state)
                    ->color(fn (string $state) => ['review' => 'warning', 'rewarded' => 'success', 'capped' => 'info', 'blocked' => 'danger', 'rejected' => 'danger'][$state] ?? 'gray'),
                TextColumn::make('reasons')->label('Why')->state(fn (Referral $r) => implode(', ', $r->reasons ?? []))->wrap()->placeholder('—'),
                TextColumn::make('rewarded_at')->label('Rewarded')->dateTime('j M Y', 'Europe/London')->placeholder('—'),
            ])
            ->filters([SelectFilter::make('status')->options(self::STATUSES)])
            ->recordActions([self::decide('approve'), self::decide('reject')]);
    }

    private static function decide(string $which): Action
    {
        return Action::make($which)->label($which === 'approve' ? 'Approve' : 'Reject')->color($which === 'approve' ? 'success' : 'danger')
            ->visible(fn (Referral $r) => $r->status === 'review')
            ->requiresConfirmation()
            ->modalDescription($which === 'approve' ? 'Both players get their reward now (the referrer only if under this month’s cap).' : 'Neither player gets a reward.')
            ->schema([Textarea::make('reason')->required()->maxLength(300)])
            ->action(function (Referral $record, array $data) use ($which) {
                $which === 'approve' ? app(Referrals::class)->approve($record) : app(Referrals::class)->reject($record);
                AdminAction::record(auth()->user(), $which === 'approve' ? 'referral.approved' : 'referral.rejected', (string) $record->id, $data['reason'], ['status' => $record->refresh()->status]);
                Notification::make()->success()->title($which === 'approve' ? 'Approved' : 'Rejected')->send();
            });
    }

    public static function canCreate(): bool
    {
        return false;
    }

    public static function getPages(): array
    {
        return ['index' => ListReferrals::route('/')];
    }
}
