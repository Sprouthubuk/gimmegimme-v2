<?php

namespace App\Filament\Resources\Users\Pages;

use App\Filament\Resources\Users\UserResource;
use App\Models\AdminAction;
use App\Models\LedgerEntry;
use App\Models\Order;
use App\Models\User;
use App\Models\Withdrawal;
use App\Support\Reports;
use Filament\Actions\Action;
use Filament\Resources\Pages\ViewRecord;
use Filament\Support\Icons\Heroicon;
use Illuminate\Support\Collection;

/**
 * Everything about one player on one page, read only: wallet and lifetime money, safer play, competitions entered
 * with their ticket numbers, wins, orders, wallet history, withdrawals and what admins have done to the account.
 */
class ViewUser extends ViewRecord
{
    protected static string $resource = UserResource::class;

    protected string $view = 'filament.resources.users.view-player';

    public const ROWS = 100;

    public function getTitle(): string
    {
        /** @var User $u */
        $u = $this->record;

        return trim($u->first_name.' '.$u->last_name) ?: $u->email;
    }

    protected function getHeaderActions(): array
    {
        return [
            Action::make('edit')->label('Edit Details')->icon(Heroicon::OutlinedPencilSquare)
                ->url(fn () => UserResource::getUrl('edit', ['record' => $this->record])),
        ];
    }

    public function money(): array
    {
        return Reports::playerMoney($this->record);
    }

    public function entries(): array
    {
        return Reports::playerEntries($this->record);
    }

    public function wins(): Collection
    {
        return Reports::playerWins($this->record);
    }

    /** @return Collection<int, Order> newest first, with their lines and competitions. */
    public function orders(): Collection
    {
        return Order::query()->where('user_id', $this->record->id)->with('lines.competition:id,title')->latest()->limit(self::ROWS)->get();
    }

    public function ordersCount(): int
    {
        return Order::query()->where('user_id', $this->record->id)->count();
    }

    /** @return Collection<int, LedgerEntry> */
    public function ledger(): Collection
    {
        return LedgerEntry::query()->where('user_id', $this->record->id)->orderByDesc('id')->limit(self::ROWS)->get();
    }

    public function ledgerCount(): int
    {
        return LedgerEntry::query()->where('user_id', $this->record->id)->count();
    }

    /** @return Collection<int, Withdrawal> */
    public function withdrawals(): Collection
    {
        return Withdrawal::query()->where('user_id', $this->record->id)->latest()->limit(self::ROWS)->get();
    }

    /** @return Collection<int, AdminAction> admin actions about this player (subject "user:{id}" or their id). */
    public function adminLog(): Collection
    {
        $id = (string) $this->record->id;

        return AdminAction::query()->whereIn('subject', [$id, 'user:'.$id])->with('admin:id,first_name,last_name')->orderByDesc('id')->limit(50)->get();
    }
}
