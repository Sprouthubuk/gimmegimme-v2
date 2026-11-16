<?php

namespace App\Filament\Widgets;

use App\Filament\Resources\Competitions\CompetitionResource;
use App\Filament\Support\Money;
use App\Models\Competition;
use App\Services\CompetitionState;
use Filament\Tables\Columns\ImageColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget;
use Illuminate\Support\HtmlString;

class LiveCompetitions extends TableWidget
{
    protected static ?int $sort = 3;

    protected int|string|array $columnSpan = 'full';

    protected static ?string $heading = 'On Sale Now';

    public function table(Table $table): Table
    {
        $state = app(CompetitionState::class);

        return $table
            ->query(Competition::query()->whereNotNull('verity_ref')->where('closes_at', '>', now())->orderBy('closes_at'))
            ->paginated([5, 10])
            ->defaultPaginationPageOption(5)
            ->recordUrl(fn (Competition $c) => CompetitionResource::getUrl('edit', ['record' => $c]))
            ->emptyStateHeading('Nothing on sale')
            ->emptyStateDescription('Published competitions with a closing date still to come show here.')
            ->columns([
                ImageColumn::make('image')->disk('public')->square()->imageSize(48),
                TextColumn::make('title')->weight('bold')->wrap()
                    ->description(fn (Competition $c) => ($c->isInstant() ? 'Instant win' : 'Live draw').' · '.Money::show($c->price_pence).' a ticket'),
                TextColumn::make('sold')->label('Sold')->state(fn (Competition $c) => $state->soldPercent($c))
                    ->formatStateUsing(fn (int $state, Competition $c) => new HtmlString(
                        '<div class="gg-progress"><span style="width:'.max(2, min(100, $state)).'%"></span></div>'
                        .'<div class="gg-progress-label">'.number_format(app(CompetitionState::class)->sold($c)).' of '.number_format($c->max_tickets).' · '.$state.'%</div>')),
                TextColumn::make('status')->badge()->state(fn (Competition $c) => $state->status($c))
                    ->color(fn (string $state) => ['live' => 'success', 'scheduled' => 'info', 'sold_out' => 'warning'][$state] ?? 'gray'),
                TextColumn::make('closes_at')->label('Closes')->since('Europe/London')
                    ->tooltip(fn (Competition $c) => $c->closes_at?->setTimezone('Europe/London')->format('D j M Y, H:i')),
            ]);
    }
}
