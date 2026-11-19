<?php

namespace App\Services;

use App\Models\Competition;
use App\Models\Order;
use App\Models\OrderLine;
use Illuminate\Database\Eloquent\Builder;

/**
 * The per-draw cap on promotional free tickets: referral voucher tickets and Gimme Box bonus tickets,
 * counted together, at most `promo_ticket_cap_pct` % of the draw's tickets (rounded down).
 *
 * Counted: paid orders, and unpaid ones still inside their hold (so two baskets can't both take the
 * last of the cap). Postal entries, bundle free tickets and promo-code discounts are not promotional
 * tickets here and are never counted or capped. Callers that give promo tickets do so with the
 * competition row locked (Orders::checkout, Referrals::redeem), so the count can't race.
 *
 * Players never see these numbers: when the cap is reached they get a neutral message.
 */
class PromoCap
{
    public const FULL_MESSAGE = 'Bonus tickets for this draw have all been given out.';

    public static function cap(Competition $c): int
    {
        $pct = max(0.0, min(100.0, (float) ($c->promo_ticket_cap_pct ?? 5)));

        return (int) floor($c->max_tickets * $pct / 100);
    }

    /** Promo tickets given (or held in a basket being paid) for this draw. */
    public static function used(Competition $c): int
    {
        $live = fn (Builder $q) => $q->where('status', 'paid')
            ->orWhere(fn ($q) => $q->whereIn('status', Order::UNPAID)->where('created_at', '>=', now()->subMinutes(Order::HOLD_MINUTES)));
        $lines = OrderLine::query()->where('competition_id', $c->id)->whereHas('order', $live);

        return (int) (clone $lines)->sum('bonus_quantity')
            + (int) (clone $lines)->where('source', 'voucher')->sum('quantity');
    }

    public static function room(Competition $c): int
    {
        return max(0, self::cap($c) - self::used($c));
    }
}
