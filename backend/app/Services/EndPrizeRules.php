<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Sprouthub\Verity\Facades\Verity;
use Sprouthub\Verity\Models\Competition as VerityCompetition;
use Sprouthub\Verity\Models\Winner;
use Sprouthub\Verity\Services\Redraws;

/**
 * One end prize per person. Verity draws several end-prize places as different TICKETS; a person
 * holding several tickets could still win two places. When that happens the later win (the higher
 * winner id: a lower place, or a redraw's replacement) is not paid, and Verity redraws it from a
 * future drand round, with the reason on the public audit chain. Verity runs one redraw per
 * competition at a time, so this is called after every end-draw result and every minute
 * (gimme:end-prize-rules) until nothing is left to redraw. Verity's redraw limit
 * (VERITY_MAX_REDRAWS) still applies: past it the place is forfeited, as its rules say.
 */
class EndPrizeRules
{
    public const REASON = 'Terms: one end prize per person';

    /** True when another active end-draw win in this competition already belongs to the same person. */
    public function isRepeatWinner(Winner $w): bool
    {
        return $w->type === 'main' && Winner::query()
            ->where('competition_id', $w->competition_id)->where('type', 'main')->where('status', 'active')
            ->where('owner_ref', $w->owner_ref)->where('id', '<', $w->id)->exists();
    }

    /** The first repeat win still waiting for its redraw, or null. */
    public function nextRepeat(VerityCompetition $c): ?Winner
    {
        $seen = [];
        foreach (Winner::query()->where('competition_id', $c->id)->where('type', 'main')->where('status', 'active')->orderBy('id')->get() as $w) {
            if (isset($seen[$w->owner_ref])) {
                return $w;
            }
            $seen[$w->owner_ref] = true;
        }

        return null;
    }

    /** Schedule the redraw for the next repeat win, if any and if Verity can take one now. */
    public function enforce(VerityCompetition $c): void
    {
        $repeat = $this->nextRepeat($c->refresh());
        if (! $repeat || $c->status !== 'drawn' || Redraws::pending($c)) {
            return; // nothing to do, or a redraw is already waiting (we run again when it is drawn)
        }
        try {
            Verity::redraw($repeat, self::REASON, by: 'site-rules', approvedBy: 'site-rules');
        } catch (\Throwable $e) {
            Log::warning('End-prize redraw not scheduled yet', ['competition' => $c->ref, 'winner' => $repeat->id, 'error' => $e->getMessage()]);
        }
    }

    /** Every drawn competition with a repeat win waiting (run every minute). */
    public function enforceAll(): int
    {
        $n = 0;
        $ids = Winner::query()->where('type', 'main')->where('status', 'active')
            ->selectRaw('competition_id, owner_ref, COUNT(*) AS n')->groupBy('competition_id', 'owner_ref')
            ->havingRaw('COUNT(*) > 1')->pluck('competition_id')->unique();
        foreach (VerityCompetition::query()->whereIn('id', $ids)->get() as $c) {
            $this->enforce($c);
            $n++;
        }

        return $n;
    }
}
