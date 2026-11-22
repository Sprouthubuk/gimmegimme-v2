<?php

namespace App\Filament\Widgets;

use App\Filament\Resources\Users\UserResource;
use App\Filament\Support\Money;
use App\Models\User;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget;

/** Who has spent most on tickets today (card and wallet). */
class TopBuyers extends TableWidget
{
    protected static ?int $sort = 4;

    protected int|string|array $columnSpan = 1;

    protected static ?string $heading = 'Top Buyers Today';

    protected ?string $pollingInterval = '60s';

    public function table(Table $table): Table
    {
        $since = now('Europe/London')->startOfDay()->utc();

        return $table
            ->query(User::query()->join('orders', 'orders.user_id', '=', 'users.id')
                ->where('orders.status', 'paid')->where('orders.order_type', 'tickets')->where('orders.paid_at', '>=', $since)
                ->groupBy('users.id', 'users.first_name', 'users.last_name', 'users.email')
                ->selectRaw('users.id, users.first_name, users.last_name, users.email, SUM(orders.total_pence) AS spent, COUNT(*) AS order_count')
                ->orderByDesc('spent')->limit(8))
            ->paginated(false)
            ->emptyStateHeading('No ticket orders yet today')
            ->recordUrl(fn (User $u) => UserResource::getUrl('view', ['record' => $u->id]))
            ->columns([
                TextColumn::make('first_name')->label('Player')->formatStateUsing(fn ($state, User $u) => trim($u->first_name.' '.$u->last_name))->description(fn (User $u) => $u->email),
                TextColumn::make('order_count')->label('Orders')->numeric(),
                TextColumn::make('spent')->label('Spent')->formatStateUsing(fn ($state) => Money::show((int) $state))->weight('bold')->alignEnd(),
            ]);
    }
}
