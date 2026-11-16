<?php

namespace App\Filament\Widgets;

use App\Filament\Resources\Orders\OrderResource;
use App\Filament\Support\Money;
use App\Models\Order;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget;

class LatestOrders extends TableWidget
{
    protected static ?int $sort = 4;

    protected int|string|array $columnSpan = 'full';

    protected static ?string $heading = 'Latest Orders';

    public function table(Table $table): Table
    {
        return $table
            ->query(Order::query()->with('user')->latest()->limit(8))
            ->paginated(false)
            ->recordUrl(fn (Order $o) => OrderResource::getUrl('index', ['tableSearch' => $o->number]))
            ->columns([
                TextColumn::make('number')->weight('bold')->fontFamily('mono'),
                TextColumn::make('user.email')->label('Player')->limit(28),
                TextColumn::make('order_type')->label('Type')->badge()->formatStateUsing(fn ($s) => $s === 'deposit' ? 'Top up' : 'Tickets')
                    ->color(fn ($s) => $s === 'deposit' ? 'info' : 'primary'),
                TextColumn::make('status')->badge()->color(fn (string $state) => ['paid' => 'success', 'pending_payment' => 'warning', 'created' => 'warning', 'refunded' => 'info'][$state] ?? 'gray'),
                TextColumn::make('total_pence')->label('Total')->formatStateUsing(fn ($state) => Money::show($state))->alignEnd()->weight('bold'),
                TextColumn::make('created_at')->label('When')->since('Europe/London'),
            ]);
    }
}
