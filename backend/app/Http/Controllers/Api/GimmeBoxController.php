<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Competition;
use App\Models\GimmeBox;
use App\Services\CompetitionState;
use App\Services\GimmeBoxes;
use App\Services\Settings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The Gimme Box. The browser sends a budget and a mode and gets back a box the server packed and
 * priced: the player's own ticket counts, prices and % sold only (no ticket counts of any draw).
 */
class GimmeBoxController extends Controller
{
    public function build(Request $r, GimmeBoxes $boxes): JsonResponse
    {
        abort_unless(Settings::gimmeBoxOn(), 404);
        $d = $r->validate([
            'budgetPence' => ['required', 'integer', 'min:1', 'max:1000000'],
            'mode' => ['required', 'string', 'in:surprise,big,most'],
            'replaces' => ['sometimes', 'nullable', 'string', 'max:40', 'regex:/^[a-z0-9]+$/'],
        ]);
        $box = $boxes->build((int) $d['budgetPence'], $d['mode'], $r->user('sanctum'), $d['replaces'] ?? null);

        return response()->json(self::present($box), 201);
    }

    /** The player put the box in their basket: hold restarts, and it's counted for the report. */
    public function added(Request $r, string $id, GimmeBoxes $boxes): JsonResponse
    {
        abort_unless(Settings::gimmeBoxOn() && preg_match('/^[a-z0-9]{32}$/', $id), 404);
        $box = $boxes->added($id, $r->user('sanctum'));

        return $box ? response()->json(self::present($box)) : response()->json(['message' => 'This box has gone. Please shake a new one.', 'code' => 'gimme_box_gone'], 410);
    }

    public static function present(GimmeBox $box): array
    {
        $comps = Competition::query()->whereIn('id', array_column($box->lines, 'competition_id'))->get()->keyBy('id');
        $state = app(CompetitionState::class);
        $lines = [];
        $basket = [];
        foreach ($box->lines as $l) {
            $c = $comps->get($l['competition_id']);
            if (! $c) {
                continue;
            }
            $lines[] = [
                'competitionId' => $c->id, 'slug' => $c->slug, 'title' => $c->title, ...$c->pictureFields(),
                'soldPercent' => $state->soldPercent($c), 'unitPence' => $c->price_pence,
                'bundleId' => $l['bundle_tier_id'], 'bundleLabel' => $l['bundle_label'], 'singles' => $l['singles'],
                'paidQuantity' => $l['paid'], 'freeQuantity' => $l['free'], 'bonusQuantity' => $l['bonus'],
                'tickets' => $l['paid'] + $l['free'] + $l['bonus'], 'linePence' => $l['line_pence'], 'notice' => $l['notice'] ?? null,
            ];
            if ($l['bundle_tier_id']) {
                $basket[] = ['competitionId' => $c->id, 'quantity' => 0, 'bundleId' => $l['bundle_tier_id'], 'boxId' => $box->id];
            }
            if ($l['singles'] > 0) {
                $basket[] = ['competitionId' => $c->id, 'quantity' => $l['singles'], 'boxId' => $box->id];
            }
        }

        return [
            'id' => $box->id, 'mode' => $box->mode, 'budgetPence' => $box->budget_pence, 'totalPence' => $box->total_pence,
            'unusedPence' => $box->budget_pence - $box->total_pence, 'tickets' => $box->tickets,
            'bonusTickets' => array_sum(array_column($box->lines, 'bonus')), 'expiresAt' => $box->expires_at->toIso8601ZuluString(),
            'lines' => $lines, 'basketLines' => $basket,
        ];
    }
}
