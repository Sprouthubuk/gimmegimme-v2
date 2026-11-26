<?php

namespace App\Filament\Resources\Competitions\Pages;

use App\Filament\Resources\Competitions\CompetitionResource;
use App\Filament\Support\Money;
use App\Models\Competition;
use App\Models\HuntClaim;
use App\Services\Hunts;
use Filament\Actions\Action;
use Filament\Forms\Components\Radio;
use Filament\Forms\Components\Select;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\Concerns\InteractsWithRecord;
use Filament\Resources\Pages\Page;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Concerns\InteractsWithTable;
use Filament\Tables\Contracts\HasTable;
use Filament\Tables\Table;

/**
 * The Hunt Board (docs/mystery-hunt.md). Every symbol found, its deadline and status. "Open a number" takes the number
 * the player chose (Facebook group or email): Verity reveals that one prize and it's paid at once. The map itself is
 * never shown here; nobody can see it until the hunt ends.
 */
class HuntBoard extends Page implements HasTable
{
    use InteractsWithRecord;
    use InteractsWithTable;

    protected static string $resource = CompetitionResource::class;

    protected string $view = 'filament.resources.competitions.hunt-board';

    public function mount(int|string $record): void
    {
        $this->record = $this->resolveRecord($record);
        abort_unless($this->record instanceof Competition && $this->record->isHunt() && $this->record->verity_ref, 404);
    }

    public function getTitle(): string
    {
        return 'Hunt Board · '.$this->record->title;
    }

    /** @return array{size:int, taken:array<int, array{name:string, prize:string}>, found:int, open:int, notWon:int, revealed:bool} */
    public function board(): array
    {
        $hunt = app(Hunts::class)->verityHunt($this->record);
        $claims = HuntClaim::query()->with('user')->where('competition_id', $this->record->id)->get();

        return [
            'size' => (int) ($hunt?->size ?? 0),
            'taken' => $claims->where('status', 'picked')->mapWithKeys(fn (HuntClaim $c) => [(int) $c->number => ['name' => (string) $c->user?->publicName(), 'prize' => $c->prize_name.' ('.Money::show((int) $c->prize_value_pence).')']])->all(),
            'found' => $claims->count(), 'open' => $claims->where('status', 'found')->count(), 'notWon' => $claims->where('status', 'expired')->count(),
            'revealed' => $hunt?->revealed_at !== null,
        ];
    }

    public function table(Table $table): Table
    {
        return $table
            ->query(HuntClaim::query()->with('user')->where('competition_id', $this->record->id))
            ->defaultSort('found_at', 'desc')
            ->poll('30s')
            ->columns([
                TextColumn::make('ticket_number')->label('Ticket')->prefix('#')->searchable(),
                TextColumn::make('user.email')->label('Player')->description(fn (HuntClaim $c) => $c->user?->first_name.' '.$c->user?->last_name)->searchable(),
                TextColumn::make('status')->badge()->color(fn (string $state) => ['found' => 'warning', 'picked' => 'success', 'expired' => 'gray'][$state] ?? 'gray')
                    ->formatStateUsing(fn (string $state) => ['found' => 'Waiting for a number', 'picked' => 'Picked', 'expired' => 'Not claimed in time'][$state] ?? $state),
                TextColumn::make('found_at')->label('Found')->dateTime('D j M, H:i', 'Europe/London'),
                TextColumn::make('deadline_at')->label('Claim by')->dateTime('D j M, H:i', 'Europe/London'),
                TextColumn::make('number')->label('Number')->placeholder('—'),
                TextColumn::make('prize_name')->label('Prize')->placeholder('—')
                    ->description(fn (HuntClaim $c) => $c->prize_value_pence !== null ? Money::show((int) $c->prize_value_pence).($c->prize_type === 'ticket_credit' ? ' credit' : ' cash') : null),
                TextColumn::make('claimed_via')->label('Via')->placeholder('—'),
            ])
            ->recordActions([
                Action::make('open')->label('Open a Number')->icon('heroicon-o-gift')->color('success')
                    ->visible(fn (HuntClaim $c) => $c->status === 'found' && $c->deadline_at->isFuture())
                    ->modalHeading(fn (HuntClaim $c) => 'Ticket #'.$c->ticket_number.': open a number')
                    ->modalDescription('Pick the number the player chose. Verity reveals that one prize and it’s paid to the player straight away. This can’t be undone, and the number can’t be used again.')
                    ->schema([
                        Select::make('number')->label('Number on the board')->required()->searchable()
                            ->options(function () {
                                $b = $this->board();

                                return collect(range(1, max(1, $b['size'])))->reject(fn ($n) => isset($b['taken'][$n]))->mapWithKeys(fn ($n) => [$n => (string) $n])->all();
                            }),
                        Radio::make('via')->label('How they claimed')->options(['facebook' => 'Facebook group', 'email' => 'Email or contact form'])->required()->default('facebook'),
                    ])
                    ->action(function (HuntClaim $record, array $data) {
                        try {
                            $won = app(Hunts::class)->pick($record, (int) $data['number'], (string) $data['via'], auth()->user());
                        } catch (\Throwable $e) {
                            Notification::make()->danger()->title('Not opened')->body($e->getMessage())->send();

                            return;
                        }
                        Notification::make()->success()->title('Number '.$data['number'].': '.$won['name'])
                            ->body(Money::show($won['value_pence']).($won['type'] === 'ticket_credit' ? ' ticket credit' : ' to winnings').' paid and emailed.')->persistent()->send();
                    }),
            ]);
    }
}
