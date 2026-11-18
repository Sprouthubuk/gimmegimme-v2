<?php

namespace App\Filament\Resources\IdChecks;

use App\Filament\Resources\IdChecks\Pages\ListIdChecks;
use App\Models\AdminAction;
use App\Models\IdCheck;
use App\Notifications\IdCheckResult;
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
use Illuminate\Support\Facades\Log;

/**
 * Photo ID and proof of address players send before their first withdrawal. An admin opens both, then
 * approves (the player can withdraw) or asks for new documents with a reason the player is told.
 */
class IdCheckResource extends Resource
{
    protected static ?string $model = IdCheck::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedIdentification;

    protected static ?string $navigationLabel = 'ID Checks';

    protected static ?int $navigationSort = 5;

    protected static string|\UnitEnum|null $navigationGroup = 'Players & Money';

    public static function canCreate(): bool
    {
        return false;
    }

    public static function getNavigationBadge(): ?string
    {
        $n = IdCheck::query()->where('status', 'pending')->count();

        return $n ? (string) $n : null;
    }

    public static function table(Table $table): Table
    {
        return $table->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('user.email')->label('Player')->searchable(),
                TextColumn::make('name')->label('Name on account')->state(fn (IdCheck $c) => $c->user->first_name.' '.$c->user->last_name),
                TextColumn::make('dob')->label('Date of birth')->state(fn (IdCheck $c) => $c->user->date_of_birth?->format('j M Y')),
                TextColumn::make('address')->label('Address on account')->wrap()
                    ->state(fn (IdCheck $c) => collect([$c->user->address_line1, $c->user->city, $c->user->postcode])->filter()->implode(', ') ?: 'Not given'),
                TextColumn::make('status')->badge()->color(fn ($state) => ['pending' => 'warning', 'approved' => 'success', 'rejected' => 'danger'][$state] ?? 'gray'),
                TextColumn::make('note')->wrap(),
                TextColumn::make('created_at')->label('Sent')->dateTime('j M Y, H:i', 'Europe/London')->sortable(),
            ])
            ->filters([SelectFilter::make('status')->options(['pending' => 'Waiting', 'approved' => 'Approved', 'rejected' => 'Rejected'])->default('pending')])
            ->recordActions([
                Action::make('photo')->label('Photo ID')->icon(Heroicon::OutlinedEye)->url(fn (IdCheck $c) => route('admin.id-check-file', [$c, 'photo']), shouldOpenInNewTab: true),
                Action::make('address')->label('Address proof')->icon(Heroicon::OutlinedEye)->url(fn (IdCheck $c) => route('admin.id-check-file', [$c, 'address']), shouldOpenInNewTab: true),
                Action::make('approve')->label('Approve')->color('success')->visible(fn (IdCheck $c) => $c->status === 'pending')
                    ->requiresConfirmation()->modalDescription('The name, date of birth and address match the documents, and the player is 18 or over.')
                    ->action(fn (IdCheck $c) => self::decide($c, 'approved', 'Documents checked')),
                Action::make('reject')->label('Ask again')->color('danger')->visible(fn (IdCheck $c) => $c->status === 'pending')
                    ->schema([Textarea::make('note')->label('Why (the player is told this)')->required()->maxLength(300)])
                    ->action(fn (IdCheck $c, array $data) => self::decide($c, 'rejected', $data['note'])),
            ]);
    }

    private static function decide(IdCheck $check, string $status, string $note): void
    {
        DB::transaction(function () use ($check, $status, $note) {
            $c = IdCheck::query()->lockForUpdate()->findOrFail($check->id);
            if ($c->status !== 'pending') {
                return;
            }
            if ($c->user_id === auth()->id()) {
                throw new \DomainException('You can’t check your own ID.');
            }
            $c->forceFill(['status' => $status, 'note' => $status === 'rejected' ? $note : null, 'decided_by' => auth()->id(), 'decided_at' => now()])->save();
            if ($status === 'approved') {
                $c->user->forceFill(['id_verified_at' => now()])->save();
            }
            AdminAction::record(auth()->user(), 'id_check.'.$status, (string) $c->user_id, $note);
            DB::afterCommit(function () use ($c) {
                try {
                    $c->user->notify(new IdCheckResult($c));
                } catch (\Throwable $e) {
                    Log::warning('ID check email not sent', ['check' => $c->id]);
                }
            });
        });
        Notification::make()->success()->title('ID check '.$status)->send();
    }

    public static function getPages(): array
    {
        return ['index' => ListIdChecks::route('/')];
    }
}
