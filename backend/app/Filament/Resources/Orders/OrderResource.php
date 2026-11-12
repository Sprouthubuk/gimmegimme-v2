<?php

namespace App\Filament\Resources\Orders;

use App\Filament\Resources\Orders\Pages\ListOrders;
use App\Filament\Support\Money;
use App\Models\AdminAction;
use App\Models\Order;
use App\Services\Orders;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Forms\Components\Textarea;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\Filter;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

/** Orders are read-only here: money moves only through the order services. */
class OrderResource extends Resource
{
    protected static ?string $model = Order::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedReceiptPercent;

    protected static ?int $navigationSort = 2;

    public static function getNavigationBadge(): ?string
    {
        $n = Order::query()->where('needs_attention', true)->count();

        return $n ? (string) $n : null;
    }

    public static function getNavigationBadgeColor(): ?string
    {
        return 'danger';
    }

    public static function canCreate(): bool
    {
        return false;
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('number')->searchable()->copyable(),
                TextColumn::make('user.email')->label('Player')->searchable(),
                TextColumn::make('order_type')->label('Type')->badge(),
                TextColumn::make('status')->badge()->color(fn (string $state) => ['paid' => 'success', 'pending_payment' => 'warning', 'created' => 'warning', 'refunded' => 'info'][$state] ?? 'gray'),
                TextColumn::make('total_pence')->label('Total')->formatStateUsing(fn ($state) => Money::show($state)),
                TextColumn::make('card_pence')->label('Card')->formatStateUsing(fn ($state) => Money::show($state)),
                TextColumn::make('wallet_pence')->label('Wallet')->formatStateUsing(fn ($state) => Money::show($state)),
                TextColumn::make('card_type')->placeholder('—'),
                IconColumn::make('needs_attention')->boolean()->label('Attention'),
                TextColumn::make('attention_reason')->wrap()->limit(80)->toggleable(),
                TextColumn::make('created_at')->dateTime('j M Y, H:i', 'Europe/London')->sortable(),
            ])
            ->filters([
                Filter::make('needs_attention')->label('Needs attention')->query(fn (Builder $q) => $q->where('needs_attention', true))->default(),
                SelectFilter::make('status')->options(array_combine($s = ['created', 'pending_payment', 'paid', 'failed', 'cancelled', 'expired', 'refunded'], $s)),
            ])
            ->recordActions([
                Action::make('check')->label('Check with Cashflows')->icon(Heroicon::OutlinedArrowPath)
                    ->visible(fn (Order $o) => $o->gateway_ref && $o->status !== 'paid')
                    ->action(function (Order $o) {
                        $o = app(Orders::class)->syncWithGateway($o);
                        Notification::make()->title('Order is '.$o->status)->send();
                    }),
                Action::make('resolve')->label('Mark handled')->icon(Heroicon::OutlinedCheck)->color('success')
                    ->visible(fn (Order $o) => $o->needs_attention)
                    ->schema([Textarea::make('reason')->label('What was done')->required()->maxLength(300)])
                    ->action(function (Order $o, array $data) {
                        $o->forceFill(['needs_attention' => false])->save();
                        AdminAction::record(auth()->user(), 'order.attention_handled', $o->number, $data['reason'], ['was' => $o->attention_reason]);
                        Notification::make()->success()->title('Marked handled')->send();
                    }),
            ]);
    }

    public static function getPages(): array
    {
        return ['index' => ListOrders::route('/')];
    }
}
