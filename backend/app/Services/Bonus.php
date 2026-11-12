<?php

namespace App\Services;

use App\Models\LedgerEntry;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;

/**
 * Sign-up bonus: a match on the first wallet top up, capped, one per person / address. Built, and
 * switched off until the owner turns `signup_bonus_enabled` on.
 */
final class Bonus
{
    public const REASON = 'Welcome bonus';

    public function __construct(private Wallet $wallet) {}

    public function maybeGrant(Order $deposit): void
    {
        if (! Setting::bool('signup_bonus_enabled') || ! $deposit->isDeposit()) {
            return;
        }
        $user = $deposit->user;
        $firstDeposit = Order::query()->where('user_id', $user->id)->where('order_type', 'deposit')->where('status', 'paid')
            ->orderBy('paid_at')->value('id');
        if ($firstDeposit !== $deposit->id || ! $user->postcode || ! $user->address_line1 || ! $user->date_of_birth) {
            return;
        }
        if ($this->alreadyHad($user)) {
            return;
        }
        $max = Setting::int('signup_bonus_max_grants');
        if ($max > 0 && LedgerEntry::query()->where('reason', self::REASON)->where('direction', 'credit')->count() >= $max) {
            return;
        }
        $amount = min($deposit->total_pence, Setting::int('signup_bonus_cap_pence'));
        if ($amount > 0) {
            $this->wallet->credit($user, 'bonus', $amount, self::REASON, 'welcome-bonus:'.$user->id, $deposit->id, now()->addDays(Settings::bonusExpiryDays()));
        }
    }

    /** Same person (name + date of birth) or same house (postcode + first address line) already had one. */
    private function alreadyHad(User $user): bool
    {
        $postcode = strtoupper(preg_replace('/\s+/', '', (string) $user->postcode));
        $line1 = strtolower(trim((string) $user->address_line1));
        $others = User::query()->where('id', '!=', $user->id)->where(function ($q) use ($user, $postcode, $line1) {
            $q->where(fn ($q) => $q->whereRaw('lower(first_name) = ?', [strtolower($user->first_name)])
                ->whereRaw('lower(last_name) = ?', [strtolower($user->last_name)])->whereDate('date_of_birth', $user->date_of_birth))
                ->orWhere(fn ($q) => $q->whereRaw("upper(replace(postcode, ' ', '')) = ?", [$postcode])
                    ->whereRaw('lower(trim(address_line1)) = ?', [$line1]));
        })->pluck('id');

        return $others->isNotEmpty() && LedgerEntry::query()->whereIn('user_id', $others)->where('reason', self::REASON)->exists();
    }
}
