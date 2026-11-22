<?php

namespace App\Filament\Pages;

use App\Filament\Resources\Users\UserResource;
use App\Filament\Support\Money;
use App\Models\Competition;
use App\Services\CompetitionState;
use App\Support\Csv;
use App\Support\Reports;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Concerns\InteractsWithTable;
use Filament\Tables\Contracts\HasTable;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Support\HtmlString;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Every published competition: tickets sold, takings (paid orders, card and wallet), how many people bought, prizes
 * won so far, instant prize value still to win, and takings less prizes won. "Top buyers" lists who spent most.
 */
class CompetitionReport extends Page implements HasTable
{
    use InteractsWithTable;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedPresentationChartBar;

    protected static ?string $title = 'Competition Report';

    protected static string|\UnitEnum|null $navigationGroup = 'Reports';

    protected static ?int $navigationSort = 3;

    protected static ?string $slug = 'competition-report';

    protected string $view = 'filament.pages.table-report';

    public function getSubheading(): ?string
    {
        return 'Takings are paid orders (card and wallet, after discounts). Prizes won is every prize’s value, cash or not. Free postal tickets count as sold but bring no takings.';
    }

    public function table(Table $table): Table
    {
        $state = app(CompetitionState::class);

        return $table
            ->query(Reports::competitionsQuery())
            ->defaultSort('closes_at', 'desc')
            ->columns([
                TextColumn::make('title')->searchable()->wrap()->description(fn (Competition $c) => ucfirst($c->type).' · closes '.$c->closes_at?->setTimezone('Europe/London')->format('j M Y, H:i')),
                TextColumn::make('status')->badge()->state(fn (Competition $c) => $state->status($c)),
                TextColumn::make('tickets_sold')->label('Sold')->sortable(query: fn ($query, string $direction) => $query->orderBy('tickets_sold', $direction))
                    ->formatStateUsing(fn ($state, Competition $c) => number_format((int) $state).' / '.number_format($c->max_tickets))
                    ->description(fn ($state, Competition $c) => ($c->max_tickets ? floor(((int) $state) * 100 / $c->max_tickets) : 0).'%'),
                TextColumn::make('revenue_pence')->label('Takings')->sortable(query: fn ($query, string $direction) => $query->orderBy('revenue_pence', $direction))
                    ->formatStateUsing(fn ($state) => Money::show((int) $state))
                    ->description(fn (Competition $c) => 'Full: '.Money::show($c->max_tickets * $c->price_pence)),
                TextColumn::make('buyers')->label('Players')->sortable(query: fn ($query, string $direction) => $query->orderBy('buyers', $direction))->numeric(),
                TextColumn::make('won_pence')->label('Prizes Won')->sortable(query: fn ($query, string $direction) => $query->orderBy('won_pence', $direction))
                    ->formatStateUsing(fn ($state) => Money::show((int) $state)),
                TextColumn::make('left_to_win')->label('Still To Win')->tooltip('Instant prizes not yet won')
                    ->state(fn (Competition $c) => $c->isInstant() ? Money::show(max(0, (int) $c->instant_pool_pence - (int) $this->instantWon($c))) : '—'),
                TextColumn::make('margin')->label('Takings − Prizes Won')
                    ->state(fn (Competition $c) => Money::show((int) $c->revenue_pence - (int) $c->won_pence))
                    ->color(fn (Competition $c) => (int) $c->revenue_pence - (int) $c->won_pence < 0 ? 'danger' : 'success'),
            ])
            ->filters([
                SelectFilter::make('type')->options(['instant' => 'Instant wins', 'draw' => 'Live draws']),
            ])
            ->recordActions([
                Action::make('buyers')->label('Top Buyers')->icon(Heroicon::OutlinedUsers)->modalSubmitAction(false)->modalCancelActionLabel('Close')
                    ->modalHeading(fn (Competition $c) => 'Top Buyers · '.$c->title)
                    ->modalContent(fn (Competition $c) => $this->buyersTable($c)),
            ])
            ->headerActions([
                Action::make('csv')->label('Download CSV')->icon(Heroicon::OutlinedArrowDownTray)->action(fn () => $this->csv()),
            ])
            ->paginated([25, 50, 100]);
    }

    /** Instant prizes won so far (an end prize is a draw win and isn't part of the instant pool). */
    private function instantWon(Competition $c): int
    {
        return (int) \Illuminate\Support\Facades\DB::table('verity_winners as w')->join('verity_competitions as vc', 'vc.id', '=', 'w.competition_id')
            ->where('vc.ref', $c->verity_ref)->where('w.type', 'instant')->where('w.status', 'active')->sum('w.prize_value_pence');
    }

    private function buyersTable(Competition $c): HtmlString
    {
        $rows = Reports::competitionTopBuyers($c);
        if ($rows->isEmpty()) {
            return new HtmlString('<p style="opacity:.6">No paid orders yet.</p>');
        }
        $html = '<table style="width:100%;font-size:14px;border-collapse:collapse"><thead><tr style="text-align:left;opacity:.6"><th style="padding:6px 0">Player</th><th>Tickets</th><th>Spent</th></tr></thead><tbody>';
        foreach ($rows as $r) {
            $html .= '<tr style="border-top:1px solid rgba(127,127,127,.2)"><td style="padding:6px 0"><a style="text-decoration:underline" href="'.e(UserResource::getUrl('view', ['record' => $r->id])).'">'
                .e(trim($r->first_name.' '.$r->last_name)).'</a><div style="opacity:.6;font-size:12px">'.e($r->email).'</div></td><td>'.number_format((int) $r->tickets).'</td><td>'.e(Money::show((int) $r->spent)).'</td></tr>';
        }

        return new HtmlString($html.'</tbody></table>');
    }

    public function csv(): StreamedResponse
    {
        $rows = $this->getFilteredSortedTableQuery()->get()->map(fn (Competition $c) => [
            $c->title, $c->type, (string) $c->closes_at?->setTimezone('Europe/London')->format('Y-m-d H:i'), (int) $c->tickets_sold, $c->max_tickets,
            number_format(((int) $c->revenue_pence) / 100, 2, '.', ''), (int) $c->buyers, number_format(((int) $c->won_pence) / 100, 2, '.', ''),
            number_format(((int) $c->revenue_pence - (int) $c->won_pence) / 100, 2, '.', ''),
        ]);

        return Csv::download('competitions-'.now('Europe/London')->format('Y-m-d').'.csv',
            ['Competition', 'Type', 'Closes (UK time)', 'Tickets sold', 'Max tickets', 'Takings (£)', 'Players', 'Prizes won (£)', 'Takings less prizes won (£)'], $rows);
    }
}
