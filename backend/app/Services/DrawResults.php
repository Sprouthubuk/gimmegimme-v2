<?php

namespace App\Services;

use App\Models\AdminAction;
use App\Models\Competition;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Sprouthub\Verity\Models\Competition as VerityCompetition;
use Sprouthub\Verity\Models\Winner;

/**
 * Draw results are held until published (owner, 25 Nov 2026). Verity still draws at the closing time from the drand
 * round it committed to, and the winner can never change; what waits is everyone being told. Until a competition's
 * result is published, its winners are left out of every public list and the player's account, the record page says
 * the result is on its way, and the winner isn't emailed or paid. Publishing (from the live draw screen, the admin,
 * or the safety net HOLD_MAX_MINUTES after the draw) pays and emails every winner through Fulfilment, once.
 */
class DrawResults
{
    /** If nobody publishes, the result goes out this long after Verity drew it. */
    public const HOLD_MAX_MINUTES = 180;

    public function __construct(private readonly Fulfilment $fulfilment) {}

    /** True when this competition's draw result may be shown and acted on (or it has no draw yet to hold). */
    public static function published(Competition $c): bool
    {
        return ! $c->hasDraw() || $c->result_published_at !== null;
    }

    /** True while Verity has drawn but the result is still held. */
    public static function held(Competition $c, ?VerityCompetition $v = null): bool
    {
        $v ??= $c->verity_ref ? VerityCompetition::query()->where('ref', $c->verity_ref)->first() : null;

        return $c->hasDraw() && $c->result_published_at === null && $v?->status === 'drawn';
    }

    /** Verity refs whose results are still held (for leaving them out of lists). */
    public static function heldRefs(): array
    {
        return Competition::query()->whereNull('result_published_at')->whereNotNull('verity_ref')->pluck('verity_ref')->all();
    }

    /** WinnerDrawn: pay and tell the winner now only if the result is already out (a redraw after publishing). */
    public function winnerDrawn(Winner $w): void
    {
        $c = Competition::query()->where('verity_ref', $w->competition->ref)->first();
        if ($c === null || self::published($c)) {
            $this->fulfilment->recordDrawWin($w);
        }
    }

    /**
     * Publish a drawn competition's result: shown everywhere, every winner paid and emailed. Once only; false when
     * there's nothing to publish (not drawn yet, or already published).
     */
    public function publish(Competition $c, ?User $admin, string $how): bool
    {
        $done = DB::transaction(function () use ($c, $admin, $how) {
            $row = Competition::query()->whereKey($c->id)->lockForUpdate()->first();
            if ($row === null || $row->result_published_at !== null || ! self::held($row)) {
                return false;
            }
            $row->forceFill(['result_published_at' => now(), 'result_published_how' => $how])->save();
            if ($admin !== null) {
                AdminAction::record($admin, 'competition.result_published', $row->id, null, ['verity_ref' => $row->verity_ref, 'how' => $how]);
            }

            return true;
        });
        if (! $done) {
            return false;
        }
        $c->refresh();
        $v = VerityCompetition::query()->where('ref', $c->verity_ref)->firstOrFail();
        foreach (Winner::query()->where('competition_id', $v->id)->where('type', 'main')->where('status', 'active')->orderBy('position')->get() as $w) {
            $this->fulfilment->recordDrawWin($w); // pays once (reference verity-winner:{id}) and emails once (one claim per winner)
        }
        Log::info('Draw result published', ['competition' => $c->verity_ref, 'how' => $how]);

        return true;
    }

    /** The safety net: publish every result held longer than HOLD_MAX_MINUTES. */
    public function publishDue(): int
    {
        $n = 0;
        $refs = VerityCompetition::query()->where('status', 'drawn')->where('drawn_at', '<=', now()->subMinutes(self::HOLD_MAX_MINUTES))->pluck('ref');
        foreach (Competition::query()->whereIn('verity_ref', $refs)->whereNull('result_published_at')->get() as $c) {
            $n += $this->publish($c, null, 'auto') ? 1 : 0;
        }

        return $n;
    }
}
