<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ArchiveCompetition;
use App\Models\ArchiveWinner;
use App\Support\PictureSizes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The old site's public record (gimme:import-archive): its competitions, winners and entry lists, read-only.
 * These draws weren't run through Verity, so nothing here links to a Verity record or calls itself verified.
 * Like the live entry lists, no ticket counts: pages say only whether there is more.
 */
class ArchiveController extends Controller
{
    public function index(): JsonResponse
    {
        $list = ArchiveCompetition::query()->orderByDesc('drawn_at')->orderBy('title')->get();

        return response()->json(['data' => $list->map(fn (ArchiveCompetition $c) => $this->summary($c))->values()]);
    }

    public function winners(): JsonResponse
    {
        $rows = ArchiveWinner::query()->where('kind', 'main')->with('competition')->orderByDesc('won_at')->orderByDesc('id')->limit(200)->get();

        return response()->json(['data' => $rows->map(fn (ArchiveWinner $w) => $this->winner($w))->values()]);
    }

    public function show(string $slug): JsonResponse
    {
        $c = ArchiveCompetition::query()->where('slug', $slug)->firstOrFail();
        $main = $c->winners()->where('kind', 'main')->orderBy('won_at')->get();

        return response()->json([
            'competition' => $this->summary($c),
            'drawWinners' => $main->map(fn (ArchiveWinner $w) => $this->winner($w, $c))->values(),
            'hasInstantWins' => $c->winners()->where('kind', 'instant')->exists(),
        ]);
    }

    public function instantWins(Request $r, string $slug): JsonResponse
    {
        $c = ArchiveCompetition::query()->where('slug', $slug)->firstOrFail();
        $per = 50;
        $page = max(1, min(10000, (int) $r->query('page', 1)));
        $rows = $c->winners()->where('kind', 'instant')->orderByDesc('won_at')->orderByDesc('id')->skip(($page - 1) * $per)->take($per + 1)->get();

        return response()->json([
            'data' => $rows->take($per)->map(fn (ArchiveWinner $w) => $this->winner($w, $c))->values(),
            'hasMore' => $rows->count() > $per,
        ]);
    }

    public function entries(Request $r, string $slug): JsonResponse
    {
        $c = ArchiveCompetition::query()->where('slug', $slug)->firstOrFail();
        $per = 100;
        $page = max(1, min(10000, (int) $r->query('page', 1)));
        $q = DB::table('archive_entries as e')->where('e.archive_competition_id', $c->id)
            ->leftJoin('archive_winners as w', fn ($j) => $j->on('w.archive_competition_id', '=', 'e.archive_competition_id')
                ->on('w.ticket_number', '=', 'e.ticket_number')->where('w.kind', '=', 'instant'))
            ->orderBy('e.ticket_number');
        if (ctype_digit((string) $r->query('q'))) {
            $q->where('e.ticket_number', (int) $r->query('q'));
        }
        $rows = $q->skip(($page - 1) * $per)->take($per + 1)->get(['e.ticket_number', 'e.name', 'e.source', 'w.prize_name']);

        return response()->json([
            'data' => $rows->take($per)->map(fn ($e) => [
                'ticket' => (int) $e->ticket_number, 'name' => $e->name, 'source' => $e->source === 'postal' ? 'postal' : 'paid', 'prizeName' => $e->prize_name,
            ])->values(),
            'hasMore' => $rows->count() > $per,
        ]);
    }

    private function summary(ArchiveCompetition $c): array
    {
        return ['slug' => $c->slug, 'title' => $c->title, 'type' => $c->kind === 'instant' ? 'instant' : 'draw',
            'drawAt' => $c->drawn_at?->toIso8601ZuluString()] + PictureSizes::fields($c->image, $c->imageUrl());
    }

    private function winner(ArchiveWinner $w, ?ArchiveCompetition $c = null): array
    {
        $c ??= $w->competition;

        return [
            'id' => 'archive-'.$w->id, 'name' => $w->name, 'town' => $w->town, 'prizeName' => $w->prize_name, 'valuePence' => (int) $w->value_pence,
            'ticketNumber' => $w->ticket_number, 'at' => $w->won_at?->toIso8601ZuluString(),
            'competitionTitle' => $c?->title, 'competitionSlug' => $c?->slug,
        ];
    }
}
