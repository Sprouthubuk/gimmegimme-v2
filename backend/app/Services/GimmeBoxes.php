<?php

namespace App\Services;

use App\Exceptions\RefusedException;
use App\Models\GimmeBox;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Builds, holds and releases Gimme Boxes. A box holds its tickets for gimme_box_hold_minutes so the
 * price shown is honoured; shaking again releases the old box first. Paying goes through the normal
 * basket and checkout (Pricing / Orders), which re-check everything.
 */
final class GimmeBoxes
{
    public function __construct(private GimmeBoxPacker $packer, private CompetitionState $state) {}

    public function build(int $budget, string $mode, ?User $user, ?string $replaces = null, ?int $seed = null): GimmeBox
    {
        if (! Settings::gimmeBoxOn()) {
            throw new RefusedException('The Gimme Box is not available right now.', 'gimme_box_off');
        }
        $min = Settings::bounded('gimme_box_min_pence', 100, 100000);
        $max = max($min, Settings::bounded('gimme_box_max_pence', 100, 100000));
        if ($budget < $min || $budget > $max || $budget % 100 !== 0) {
            throw new RefusedException('Choose a budget between £'.($min / 100).' and £'.($max / 100).'.', 'gimme_box_budget');
        }
        if (! in_array($mode, GimmeBoxPacker::MODES, true)) {
            throw new RefusedException('Choose how to pack your box.', 'gimme_box_mode');
        }

        return DB::transaction(function () use ($budget, $mode, $user, $replaces, $seed) {
            if ($replaces) {
                $this->release($replaces);
            }
            $packed = $this->packer->pack($budget, $mode, $user?->id, $seed);
            if ($packed['lines'] === []) {
                throw new RefusedException("We couldn't pack a box with that budget right now. Try a bigger budget or another time.", 'gimme_box_empty');
            }
            $lines = array_map(fn ($l) => [
                'competition_id' => $l['competition']->id, 'bundle_tier_id' => $l['bundle']['id'] ?? null, 'bundle_label' => $l['bundle']['label'] ?? null,
                'singles' => $l['singles'], 'paid' => $l['paid'], 'free' => $l['free'], 'bonus' => $l['bonus'], 'line_pence' => $l['linePence'], 'notice' => $l['notice'] ?? null,
            ], $packed['lines']);

            return GimmeBox::query()->create([
                'id' => Str::lower(Str::random(32)), 'user_id' => $user?->id, 'budget_pence' => $budget, 'mode' => $mode, 'lines' => $lines,
                'total_pence' => $packed['totalPence'], 'tickets' => array_sum(array_map(fn ($l) => $l['paid'] + $l['free'] + $l['bonus'], $lines)),
                'status' => 'built', 'expires_at' => now()->addMinutes(Settings::bounded('gimme_box_hold_minutes', 1, 60)),
            ]);
        });
    }

    /** Let a box's tickets go (shaken again, or emptied). A box already in an order is left alone. */
    public function release(string $id): void
    {
        GimmeBox::query()->whereKey($id)->whereIn('status', GimmeBox::HOLDING)->update(['status' => 'released']);
    }

    /** The player put the box in their basket: the hold restarts from now. */
    public function added(string $id, ?User $user): ?GimmeBox
    {
        $box = GimmeBox::query()->find($id);
        if (! $box || ! in_array($box->status, GimmeBox::HOLDING, true)) {
            return null;
        }
        $box->forceFill(['status' => 'added', 'user_id' => $box->user_id ?? $user?->id,
            'expires_at' => now()->addMinutes(Settings::bounded('gimme_box_hold_minutes', 1, 60))])->save();

        return $box;
    }

    /** Boxes whose hold has passed stop holding tickets (their bonus is still honoured at checkout). */
    public function expire(): int
    {
        return GimmeBox::query()->where('status', 'built')->where('expires_at', '<=', now())->update(['status' => 'expired']);
    }
}
