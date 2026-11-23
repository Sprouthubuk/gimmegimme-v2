<?php

namespace App\Filament\Pages;

use App\Filament\Resources\Users\UserResource;
use App\Filament\Support\Money;
use App\Support\Reports;
use BackedEnum;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Concerns\InteractsWithTable;
use Filament\Tables\Contracts\HasTable;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Sprouthub\Verity\Models\InstantTicket;

/**
 * Prize boosts: every instant prize Verity added after launch (spec §17), its ticket number and who has won it, plus
 * the saved output of each competitions:boost-prizes run (dry runs included). Read only: Verity's tables are never written here.
 */
class PrizeBoostReport extends Page implements HasTable
{
    use InteractsWithTable;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedFire;

    protected static ?string $title = 'Prize Boosts';

    protected static ?string $navigationLabel = 'Prize Boosts';

    protected static string|\UnitEnum|null $navigationGroup = 'Reports';

    protected static ?int $navigationSort = 4;

    protected static ?string $slug = 'prize-boosts';

    protected string $view = 'filament.pages.prize-boosts';

    /** @return list<array{name: string, text: string}> the latest saved runs, newest first */
    public function runs(): array
    {
        return collect(Storage::disk('local')->files('boosts'))->sortDesc()->take(6)
            ->map(fn ($f) => ['name' => basename($f), 'text' => (string) Storage::disk('local')->get($f)])->values()->all();
    }

    public function table(Table $table): Table
    {
        return $table
            ->query(InstantTicket::query()->whereNotNull('verity_instant_tickets.addition_id')
                ->join('verity_instant_prizes as p', 'p.id', '=', 'verity_instant_tickets.instant_prize_id')
                ->join('verity_instant_additions as a', 'a.id', '=', 'verity_instant_tickets.addition_id')
                ->join('verity_competitions as vc', 'vc.id', '=', 'verity_instant_tickets.competition_id')
                ->leftJoin('verity_entries as e', 'e.instant_ticket_id', '=', 'verity_instant_tickets.id')
                ->leftJoin('verity_entry_groups as g', 'g.id', '=', 'e.entry_group_id')
                ->leftJoin('users', fn ($j) => $j->whereRaw(Reports::ownerOf('g.owner_ref')))
                ->select('verity_instant_tickets.*', 'p.name as prize_name', 'p.value_pence', 'a.sealed_at as added_at', 'a.number as addition', 'vc.title as competition_title',
                    'g.created_at as won_at', 'users.id as user_id', 'users.email'))
            ->defaultSort('p.value_pence', 'desc')
            ->recordUrl(fn ($record) => $record->user_id ? UserResource::getUrl('view', ['record' => $record->user_id]) : null)
            ->columns([
                TextColumn::make('competition_title')->label('Competition')->wrap(),
                TextColumn::make('prize_name')->label('Prize')->searchable(['p.name']),
                TextColumn::make('value_pence')->label('Value')->formatStateUsing(fn ($state) => Money::show((int) $state))
                    ->sortable(query: fn ($query, string $direction) => $query->orderBy('p.value_pence', $direction)),
                TextColumn::make('ticket_number')->label('Ticket')->searchable(['verity_instant_tickets.ticket_number'])->sortable(),
                TextColumn::make('added_at')->label('Added')->dateTime('j M Y, H:i', 'Europe/London'),
                TextColumn::make('won_at')->label('Sold')->dateTime('j M Y, H:i', 'Europe/London')->placeholder('Not sold yet'),
                TextColumn::make('email')->label('Winner')->placeholder('—'),
            ])
            ->filters([
                SelectFilter::make('competition')->label('Competition')
                    ->options(fn () => DB::table('verity_instant_additions as a')->join('verity_competitions as vc', 'vc.id', '=', 'a.competition_id')->distinct()->pluck('vc.title', 'vc.id')->all())
                    ->query(fn ($query, array $data) => filled($data['value'] ?? null) ? $query->where('verity_instant_tickets.competition_id', $data['value']) : $query),
                TernaryFilter::make('won')->label('Sold')->queries(true: fn ($q) => $q->whereNotNull('e.id'), false: fn ($q) => $q->whereNull('e.id')),
            ])
            ->paginated([25, 50, 100]);
    }
}
