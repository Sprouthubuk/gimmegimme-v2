<?php

namespace App\Services;

use App\Models\Competition;
use App\Models\PromoCode;
use App\Models\User;

/**
 * Prices a basket from the database only. The browser sends competition ids and quantities;
 * everything else (price, availability, discount, what the wallet covers) is decided here.
 */
final class Pricing
{
    public const MAX_LINES = 20;

    public function __construct(private CompetitionState $state, private Wallet $wallet, private PlayCheck $check) {}

    /**
     * @param  array<int, array{competitionId:string, quantity:int}>  $lines
     * @return array<string, mixed> PricedBasket (docs/api.md) plus 'competitions' (id => Competition) for checkout
     */
    public function price(array $lines, ?User $user, ?string $promoCode): array
    {
        $merged = [];
        foreach (array_slice($lines, 0, self::MAX_LINES) as $l) {
            $merged[$l['competitionId']] = ($merged[$l['competitionId']] ?? 0) + (int) $l['quantity'];
        }
        $competitions = Competition::query()->whereIn('id', array_keys($merged))->get()->keyBy('id');
        $owner = $user?->ownerRef();
        $out = [];
        $problems = [];
        $subtotal = 0;
        $count = 0;

        foreach ($merged as $id => $qty) {
            $c = $competitions->get($id);
            if (! $c || ! $c->verity_ref) {
                $problems[] = 'A competition in your basket is no longer available.';

                continue;
            }
            $max = $this->state->canBuy($c, $owner);
            $status = $this->state->status($c);
            $problem = match (true) {
                $status === 'sold_out' => 'Sold out.',
                $status !== 'live' => 'This competition is closed.',
                $qty < 1 => 'Choose at least one ticket.',
                $max === 0 && $this->state->left($c) - $this->state->reserved($c) <= 0 => 'The last tickets are being paid for right now. Try again in a few minutes.',
                $max === 0 => "You've reached the ticket limit for this competition.",
                $qty > $max => 'You can buy '.$max.' more '.($max === 1 ? 'ticket' : 'tickets').' for this competition.',
                // The minimum order for the competition, unless fewer than that are left for this player.
                $qty < (int) ($c->min_tickets ?: 1) && $qty < $max => 'The minimum for this competition is '.number_format((int) $c->min_tickets).' tickets.',
                default => null,
            };
            $line = $qty * $c->price_pence;
            $out[] = [
                'competitionId' => $c->id, 'slug' => $c->slug, 'title' => $c->title, 'image' => $c->imageUrl(), 'type' => $c->type,
                'quantity' => $qty, 'unitPence' => $c->price_pence, 'linePence' => $line, 'maxQuantity' => $max, 'minQuantity' => (int) ($c->min_tickets ?: 1), 'problem' => $problem,
            ];
            $subtotal += $line;
            $count += $qty;
        }

        $promo = null;
        if ($promoCode !== null && trim($promoCode) !== '') {
            $code = PromoCode::query()->where('code', strtoupper(trim($promoCode)))->where('active', true)->first();
            if (! $code || ($code->expires_at && $code->expires_at->isPast()) || ($code->max_uses !== null && $code->uses >= $code->max_uses)) {
                $problems[] = "That promo code isn't valid.";
            } else {
                // Never more than half, never free.
                $discount = min(intdiv($subtotal * min($code->percent_off, PromoCode::MAX_PERCENT), 100), intdiv($subtotal, 2));
                $promo = ['code' => $code->code, 'discountPence' => $discount];
            }
        }
        $total = $subtotal - ($promo['discountPence'] ?? 0);

        if (! Settings::salesOpen()) {
            $problems[] = PlayCheck::MESSAGES['sales_closed'];
        }
        if ($user && ($block = $this->check->block($user))) {
            $problems[] = PlayCheck::MESSAGES[$block];
        }
        if ($out === [] && $problems === []) {
            $problems[] = 'Your basket is empty.';
        }

        $walletCan = $user ? $this->wallet->spendable($user, $total) : 0;

        return [
            'lines' => $out,
            'totalPence' => $total,
            'subtotalPence' => $subtotal,
            'ticketCount' => $count,
            'promo' => $promo,
            'walletCanPayPence' => $walletCan,
            'walletCovers' => $user !== null && $total > 0 && $walletCan >= $total,
            'problems' => array_values(array_unique($problems)),
            'competitions' => $competitions,
        ];
    }
}
