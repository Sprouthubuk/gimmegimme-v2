<?php

namespace App\Services;

use App\Http\Presenters\AccountPresenter;
use App\Models\Order;
use App\Models\OrderLine;
use App\Models\User;
use Sprouthub\Verity\Models\InstantPrize;

/**
 * The reveal the player watches. Outcomes were decided by Verity and paid when the order was
 * fulfilled; this only reports them, for this order's tickets only, and marks them watched.
 * Asking again returns the same result.
 */
final class Reveal
{
    public function __construct(private AccountPresenter $present, private Wallet $wallet, private Fulfilment $fulfilment) {}

    public function forOrder(Order $order, User $user): array
    {
        $lines = $order->lines()->with('competition.prizes')->get()->filter(fn (OrderLine $l) => $l->competition->isInstant() && $l->tickets);
        $tickets = [];
        $context = [];
        $total = 0;
        $credited = 0;
        foreach ($lines as $line) {
            $c = $line->competition;
            // A safety net: settle anything not yet played (e.g. a fulfilment interrupted after entry).
            if ($line->entry_group_ref) {
                $this->fulfilment->playAll($line->entry_group_ref);
            }
            $wins = $this->present->winsByTicket($c, $line->tickets);
            $types = InstantPrize::query()->whereHas('competition', fn ($q) => $q->where('ref', $c->verity_ref))->get(['key', 'meta'])
                ->mapWithKeys(fn ($p) => [$p->key => $p->meta['type'] ?? 'site_credit']);
            foreach ($line->tickets as $n) {
                $w = $wins[$n] ?? null;
                $type = $w ? ($types[$w['key']] ?? 'site_credit') : null;
                $tickets[] = ['ticketNumber' => $n, 'competitionId' => $c->id, 'competitionTitle' => $c->title,
                    'prize' => $w ? ['name' => $w['name'], 'valuePence' => $w['value'], 'type' => $type] : null,
                    // The competition's public fairness record (the same page the competition links to).
                    'proofUrl' => $c->verity_ref ? '/verify/'.$c->verity_ref : null];
                if ($w) {
                    $total += $w['value'];
                    $credited += $type === 'physical' ? 0 : $w['value'];
                }
            }
            $context[$c->id] = [
                'game' => $c->game, 'isInstantWin' => true, 'skin' => $c->skin ?? 'classic',
                'prizeLabels' => $c->prizes->sortByDesc('value_pence')->pluck('name')->unique()->values()->all(),
                'inLiveDraw' => $c->end_prize_name !== null, 'endPrizeName' => $c->end_prize_name,
            ];
            if (! $line->revealed_at) {
                $line->forceFill(['revealed_at' => now()])->save();
            }
        }

        return [
            'outcome' => ['purchaseId' => $order->number, 'tickets' => $tickets, 'totalWonPence' => $total, 'creditedPence' => $credited, 'balanceAfterPence' => $this->wallet->total($user)],
            'context' => (object) $context,
        ];
    }
}
