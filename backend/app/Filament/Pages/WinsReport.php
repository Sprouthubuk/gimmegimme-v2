<?php

namespace App\Filament\Pages;

use App\Filament\Resources\Users\UserResource;
use App\Filament\Support\Money;
use App\Support\Csv;
use App\Support\Reports;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\TextInput;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Concerns\InteractsWithTable;
use Filament\Tables\Contracts\HasTable;
use Filament\Tables\Filters\Filter;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Sprouthub\Verity\Models\Winner;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Every win, instant and draw, newest first: who, what, how much, which competition. Filter by value, type,
 * competition and dates; download what's shown as CSV. Read only (Verity's winners are never written here).
 */
class WinsReport extends Page implements HasTable
{
    use InteractsWithTable;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedTrophy;

    protected static ?string $title = 'Wins';

    protected static ?string $navigationLabel = 'Wins Report';

    protected static string|\UnitEnum|null $navigationGroup = 'Reports';

    protected static ?int $navigationSort = 1;

    protected static ?string $slug = 'wins-report';

    protected string $view = 'filament.pages.table-report';

    public function getSubheading(): ?string
    {
        return 'Big wins are '.Money::show(Reports::bigWinPence()).' or more (change it in Settings). Times are UK time.';
    }

    public static function query(): Builder
    {
        return Winner::query()
            ->join('verity_competitions as vc', 'vc.id', '=', 'verity_winners.competition_id')
            ->leftJoin('users', fn ($j) => $j->whereRaw(Reports::ownerOf('verity_winners.owner_ref')))
            ->where('verity_winners.status', 'active')
            ->select('verity_winners.*', 'vc.title as competition_title', 'users.id as user_id', 'users.first_name', 'users.last_name', 'users.email');
    }

    public function table(Table $table): Table
    {
        return $table
            ->query(self::query())
            ->defaultSort('verity_winners.created_at', 'desc')
            ->recordUrl(fn ($record) => $record->user_id ? UserResource::getUrl('view', ['record' => $record->user_id]) : null)
            ->columns([
                TextColumn::make('created_at')->label('Won')->dateTime('j M Y, H:i', 'Europe/London')
                    ->sortable(query: fn ($query, string $direction) => $query->orderBy('verity_winners.created_at', $direction)),
                TextColumn::make('first_name')->label('Player')->placeholder('Not linked to an account')
                    ->formatStateUsing(fn ($state, $record) => trim($record->first_name.' '.$record->last_name))->description(fn ($record) => $record->email)
                    ->searchable(['users.first_name', 'users.last_name', 'users.email']),
                TextColumn::make('prize_name')->label('Prize')->searchable(['verity_winners.prize_name'])
                    ->badge(fn ($record) => (int) $record->prize_value_pence >= Reports::bigWinPence())->color(fn ($record) => (int) $record->prize_value_pence >= Reports::bigWinPence() ? 'warning' : null),
                TextColumn::make('prize_value_pence')->label('Value')->formatStateUsing(fn ($state) => Money::show((int) $state))
                    ->sortable(query: fn ($query, string $direction) => $query->orderBy('verity_winners.prize_value_pence', $direction)),
                TextColumn::make('competition_title')->label('Competition')->searchable(['vc.title'])->wrap(),
                TextColumn::make('type')->badge()->formatStateUsing(fn ($state) => $state === 'instant' ? 'Instant' : 'Draw'),
            ])
            ->filters([
                Filter::make('big')->label('Big wins only')->toggle()
                    ->query(fn ($query) => $query->where('verity_winners.prize_value_pence', '>=', Reports::bigWinPence())),
                Filter::make('value')->schema([TextInput::make('min')->label('Worth at least (£)')->numeric()->minValue(0)])
                    ->query(fn ($query, array $data) => filled($data['min'] ?? null) ? $query->where('verity_winners.prize_value_pence', '>=', (int) round(((float) $data['min']) * 100)) : $query)
                    ->indicateUsing(fn (array $data) => filled($data['min'] ?? null) ? 'Worth ≥ £'.$data['min'] : null),
                SelectFilter::make('type')->options(['instant' => 'Instant wins', 'draw' => 'Draws'])
                    ->query(fn ($query, array $data) => filled($data['value'] ?? null) ? $query->where('verity_winners.type', $data['value']) : $query),
                SelectFilter::make('competition')->label('Competition')->searchable()
                    ->options(fn () => \Illuminate\Support\Facades\DB::table('verity_competitions')->orderByDesc('id')->pluck('title', 'id')->all())
                    ->query(fn ($query, array $data) => filled($data['value'] ?? null) ? $query->where('verity_winners.competition_id', $data['value']) : $query),
                Filter::make('dates')->schema([DatePicker::make('from')->label('From'), DatePicker::make('until')->label('Until')])
                    ->query(fn ($query, array $data) => $query
                        ->when($data['from'] ?? null, fn ($q, $v) => $q->where('verity_winners.created_at', '>=', Carbon::parse($v, 'Europe/London')->startOfDay()->utc()))
                        ->when($data['until'] ?? null, fn ($q, $v) => $q->where('verity_winners.created_at', '<=', Carbon::parse($v, 'Europe/London')->endOfDay()->utc())))
                    ->indicateUsing(fn (array $data) => ($data['from'] ?? null) || ($data['until'] ?? null) ? 'Dates: '.($data['from'] ?? '…').' to '.($data['until'] ?? '…') : null),
            ])
            ->headerActions([
                Action::make('csv')->label('Download CSV')->icon(Heroicon::OutlinedArrowDownTray)
                    ->action(fn () => $this->csv()),
            ])
            ->paginated([25, 50, 100]);
    }

    public function csv(): StreamedResponse
    {
        $rows = $this->getFilteredSortedTableQuery()->limit(50000)->get()->map(fn ($w) => [
            Carbon::parse($w->created_at)->setTimezone('Europe/London')->format('Y-m-d H:i'), trim($w->first_name.' '.$w->last_name), (string) $w->email,
            (string) $w->prize_name, number_format(((int) $w->prize_value_pence) / 100, 2, '.', ''), (string) $w->competition_title, $w->type === 'instant' ? 'Instant' : 'Draw',
        ]);

        return Csv::download('wins-'.now('Europe/London')->format('Y-m-d').'.csv', ['Won (UK time)', 'Player', 'Email', 'Prize', 'Value (£)', 'Competition', 'Type'], $rows);
    }
}
