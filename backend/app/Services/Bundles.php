<?php

namespace App\Services;

use App\Models\BundleTier;
use App\Models\Competition;

/**
 * Which "Buy X Get Y Free" bundles a competition can sell right now. Decided here only: a bundle is
 * offered when bundles are on, it is attached and active, it fits in the tickets that are left (less
 * those being paid for), and it is no bigger than the competition's share limit. Anything else is
 * never sent to the browser, and refused at checkout.
 */
final class Bundles
{
    public function __construct(private CompetitionState $state) {}

    /**
     * @return list<array{tier: BundleTier, paid: int, free: int, total: int, label: string, featured: bool}>
     */
    public function available(Competition $c, ?int $room = null): array
    {
        if (! $c->offersBundles()) {
            return [];
        }
        $room ??= $this->state->status($c) === 'live' ? max(0, $this->state->left($c) - $this->state->reserved($c)) : 0;
        $share = self::shareLimit($c);
        $out = [];
        foreach ($c->bundleTiers as $tier) {
            $total = $tier->total();
            if (! $tier->is_active || $total > $room || $total > $share) {
                continue;
            }
            $out[] = ['tier' => $tier, 'paid' => $tier->paid_qty, 'free' => $tier->free_qty, 'total' => $total,
                'label' => $tier->displayLabel($tier->pivot->override_label), 'featured' => (bool) $tier->pivot->is_featured];
        }

        return $out;
    }

    /** The biggest bundle this competition may sell, in tickets. */
    public static function shareLimit(Competition $c): int
    {
        return intdiv($c->max_tickets * max(0, min(100, (int) $c->max_bundle_share_pct)), 100);
    }

    /** Public view of the bundles: prices and ticket counts per bundle, nothing about the pool. */
    public function forPlayers(Competition $c): array
    {
        return array_map(fn (array $b) => [
            'id' => $b['tier']->id,
            'label' => $b['label'],
            'paid' => $b['paid'],
            'free' => $b['free'],
            'tickets' => $b['total'],
            'pricePence' => $b['paid'] * $c->price_pence,
            'savePence' => $b['free'] * $c->price_pence,
            'ourPick' => $b['featured'],
        ], $this->available($c));
    }

    /**
     * The worst-case money picture for the admin (all tickets sold in the biggest bundle, one order
     * each). Cashflows takes 1.6% + 15p per order.
     *
     * @return array<string, int|null>
     */
    public static function margin(int $pricePence, int $maxTickets, ?int $prizeCostPence, array $tiers): array
    {
        $singles = $pricePence * $maxTickets;
        $fees = fn (int $revenue, int $orders) => (int) round($revenue * 0.016) + 15 * $orders;
        $biggest = collect($tiers)->sortByDesc(fn ($t) => $t['paid'] + $t['free'])->first();
        if ($biggest) {
            $size = $biggest['paid'] + $biggest['free'];
            $orders = intdiv($maxTickets, $size);
            $rest = $maxTickets - $orders * $size;          // what's left after the last whole bundle, sold as singles
            $worst = $orders * $biggest['paid'] * $pricePence + $rest * $pricePence;
            $worstOrders = $orders + ($rest > 0 ? 1 : 0);
        } else {
            $worst = $singles;
            $worstOrders = $maxTickets;
        }
        $worstFees = $fees($worst, $worstOrders);
        $profit = $prizeCostPence === null ? null : $worst - $worstFees - $prizeCostPence;
        // Break-even in the same worst case: tickets that must sell, all in the biggest bundle (or as
        // singles when there are no bundles), to cover the prize and the fees.
        $breakEven = null;
        if ($prizeCostPence !== null) {
            [$paid, $size] = $biggest ? [$biggest['paid'], $biggest['paid'] + $biggest['free']] : [1, 1];
            $netPerOrder = $paid * $pricePence - $fees($paid * $pricePence, 1);
            $breakEven = $netPerOrder > 0 ? (int) ceil($prizeCostPence / $netPerOrder) * $size : null;
        }

        return ['singlesRevenuePence' => $singles, 'worstRevenuePence' => $worst, 'worstFeesPence' => $worstFees,
            'prizeCostPence' => $prizeCostPence, 'worstProfitPence' => $profit, 'breakEvenTickets' => $breakEven];
    }
}
