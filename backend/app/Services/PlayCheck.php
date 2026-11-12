<?php

namespace App\Services;

use App\Exceptions\RefusedException;
use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * The one check every way of playing goes through: card, wallet, card + wallet, deposits,
 * postal entries. Refuses with a stable reason code and a message a player can read.
 *
 * Spend limits count real money paid in (deposits and card payments), including card payments
 * still in progress from the last 30 minutes. The credit-card cap treats a card payment whose
 * card type is not yet known as if it could be a credit card.
 */
final class PlayCheck
{
    public const MESSAGES = [
        'sales_closed' => 'Entries open soon.',
        'staff' => "Staff accounts can't enter competitions.",
        'closed' => 'This account is closed.',
        'on_hold' => 'Your account is on hold. Please contact us.',
        'self_excluded' => "Your account is self-excluded, so you can't enter right now.",
        'cool_off' => "You're on a break, so you can't enter right now.",
        'no_date_of_birth' => 'Add your date of birth before you enter.',
        'under_18' => 'You must be 18 or over to enter.',
        'email_unverified' => 'Please confirm your email address before you enter — check your inbox.',
        'spend_limit' => 'This would take you past your weekly deposit limit.',
        'credit_card_cap' => 'Credit card payments are limited to £250 a month. Pay by debit card or from your wallet.',
    ];

    /** The reason this account can't play at all right now, ignoring amounts and the sales switch. */
    public function block(User $user): ?string
    {
        $now = now();

        return match (true) {
            $user->is_staff || $user->is_admin => 'staff',
            $user->closed_at !== null => 'closed',
            $user->on_hold_at !== null => 'on_hold',
            $user->self_excluded_until !== null && $user->self_excluded_until->isAfter($now) => 'self_excluded',
            $user->cool_off_until !== null && $user->cool_off_until->isAfter($now) => 'cool_off',
            $user->date_of_birth === null => 'no_date_of_birth',
            $user->date_of_birth->copy()->addYears(18)->isAfter($now) => 'under_18',
            ! $user->hasVerifiedEmail() => 'email_unverified',
            default => null,
        };
    }

    /**
     * Refuse unless this account may pay $cardPence by card (0 for wallet only) now.
     * $isDeposit: a wallet top up, which is real money paid in like a card payment.
     */
    public function assertAllowed(User $user, int $cardPence = 0, bool $ignoreSalesSwitch = false): void
    {
        if (! $ignoreSalesSwitch && ! Settings::salesOpen()) {
            $this->refuse('sales_closed');
        }
        if ($reason = $this->block($user)) {
            $this->refuse($reason, 403);
        }
        if ($cardPence <= 0) {
            return;
        }
        $limit = $user->limits?->weekly_deposit_pence;
        if ($limit !== null && $this->paidInSince($user, now()->subDays(7)) + $cardPence > $limit) {
            $this->refuse('spend_limit', 403);
        }
        $cap = Settings::creditCardMonthlyCap();
        if ($cap > 0 && $this->creditCardSpendThisMonth($user) + $cardPence > $cap) {
            $this->refuse('credit_card_cap', 403);
        }
    }

    /** Card payments and deposits paid since $since, plus card payments in progress. */
    public function paidInSince(User $user, Carbon $since): int
    {
        $paid = (int) Order::query()->where('user_id', $user->id)->where('status', 'paid')->where('paid_at', '>=', $since)->sum('card_pence');

        return $paid + $this->inProgress($user);
    }

    public function creditCardSpendThisMonth(User $user): int
    {
        $start = now('Europe/London')->startOfMonth()->utc();
        $paid = (int) Order::query()->where('user_id', $user->id)->where('status', 'paid')->where('paid_at', '>=', $start)
            ->where(fn ($q) => $q->where('card_type', 'credit')->orWhereNull('card_type'))->where('card_pence', '>', 0)->sum('card_pence');

        return $paid + $this->inProgress($user);
    }

    private function inProgress(User $user): int
    {
        return (int) Order::query()->where('user_id', $user->id)->whereIn('status', Order::UNPAID)
            ->where('created_at', '>=', now()->subMinutes(30))->sum('card_pence');
    }

    private function refuse(string $reason, int $status = 422): never
    {
        throw new RefusedException(self::MESSAGES[$reason], $reason, $status);
    }
}
