<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Presenters\CompetitionPresenter;
use App\Models\Competition;
use App\Models\ContactMessage;
use App\Models\Page;
use App\Models\Setting;
use App\Models\User;
use App\Services\CompetitionState;
use App\Services\Fulfilment;
use App\Services\Settings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Sprouthub\Verity\Models\Entry;
use Sprouthub\Verity\Models\Winner;

class PublicController extends Controller
{
    /**
     * One CompetitionState per request (it caches Verity rows while answering). Kept on the request, not
     * on the controller, because Laravel reuses controller instances between requests in one process.
     */
    private function state(): CompetitionState
    {
        $attrs = request()->attributes;
        if (! $attrs->has('gg.state')) {
            $attrs->set('gg.state', app(CompetitionState::class));
        }

        return $attrs->get('gg.state');
    }

    private function present(): CompetitionPresenter
    {
        return new CompetitionPresenter($this->state());
    }

    public function site(): JsonResponse
    {
        return response()->json([
            'salesOpen' => Settings::salesOpen(),
            'minDepositPence' => Settings::minDeposit(),
            'minCardPence' => Settings::minCard(),
            'minWithdrawalPence' => Settings::minWithdrawal(),
            'maxTopUpPence' => Settings::maxTopUp(),
            'featuredSlug' => Setting::get('featured_slug') ?: Competition::query()->published()->where('featured', true)->where('closes_at', '>', now())->orderBy('closes_at')->value('slug'),
            'socials' => ['instagram' => Setting::get('instagram_url'), 'facebook' => Setting::get('facebook_url')],
            'supportEmail' => Setting::get('support_email'),
        ]);
    }

    public function competitions(Request $r): JsonResponse
    {
        $list = Competition::query()->published()->with('prizes')->where('closes_at', '>', now()->subDays(1))
            ->when(in_array($r->query('type'), ['instant', 'draw'], true), fn ($q) => $q->where('type', $r->query('type')))
            ->orderByDesc('featured')->orderBy('closes_at')->limit(200)->get()
            ->filter(fn (Competition $c) => in_array($this->state()->status($c), ['live', 'sold_out'], true))
            ->map(fn (Competition $c) => $this->present()->summary($c))->values();

        return response()->json(['data' => $list]);
    }

    public function competition(Request $r, string $slug): JsonResponse
    {
        $c = Competition::query()->published()->with('prizes')->where('slug', $slug)->firstOrFail();

        return response()->json($this->present()->detail($c, $r->user()));
    }

    public function instantWinners(Request $r): JsonResponse
    {
        $limit = max(1, min(50, (int) $r->query('limit', 20)));
        $page = max(1, (int) $r->query('page', 1));
        $q = Winner::query()->where('type', 'instant')->where('status', 'active')->with('competition:id,ref,title')->orderByDesc('id');
        $hosts = Competition::query()->published()->get(['id', 'verity_ref', 'title', 'game'])->keyBy('verity_ref');
        if ($game = $r->query('game')) {
            $refs = $hosts->where('game', $game)->keys();
            $q->whereHas('competition', fn ($w) => $w->whereIn('ref', $refs));
        }
        $total = (clone $q)->count();
        $rows = $q->skip(($page - 1) * $limit)->take($limit)->get();

        return response()->json(['total' => $total, 'data' => $rows->map(function (Winner $w) use ($hosts) {
            $h = $hosts->get($w->competition->ref);

            return [
                'id' => (string) $w->id, 'name' => $this->publicName($w->owner_ref), 'prizeName' => $w->prize_name, 'valuePence' => (int) $w->prize_value_pence,
                'game' => $h?->game, 'gameLabel' => CompetitionPresenter::GAME_LABELS[$h?->game] ?? null,
                'competitionTitle' => $h?->title ?? $w->competition->title, 'at' => $w->created_at->toIso8601ZuluString(),
            ];
        })->values()]);
    }

    public function drawWinners(): JsonResponse
    {
        $hosts = Competition::query()->published()->get(['id', 'verity_ref', 'title'])->keyBy('verity_ref');
        $rows = Winner::query()->where('type', 'main')->where('status', 'active')->with(['competition', 'entry'])->orderByDesc('id')->limit(100)->get();

        return response()->json(['data' => $rows->map(fn (Winner $w) => [
            'id' => (string) $w->id, 'name' => $this->publicName($w->owner_ref), 'prizeName' => $w->prize_name,
            'competitionTitle' => $hosts->get($w->competition->ref)?->title ?? $w->competition->title,
            'ticketNumber' => $w->entry ? (int) $w->entry->number : null, 'at' => $w->created_at->toIso8601ZuluString(),
            'videoUrl' => null, 'verifyUrl' => '/verify/'.$w->competition->ref,
        ])->values()]);
    }

    /** Closed and drawn draws whose entry list Verity has published. */
    public function entryLists(): JsonResponse
    {
        $list = Competition::query()->published()->with('prizes')->where('closes_at', '<=', now())->orderByDesc('closes_at')->limit(100)->get()
            ->filter(fn (Competition $c) => $c->hasDraw() && in_array($this->state()->verity($c)?->status, ['drawn', 'carried'], true))
            ->map(fn (Competition $c) => $this->present()->summary($c) + ['entries' => (int) $this->state()->verity($c)->entries_count])->values();

        return response()->json(['data' => $list]);
    }

    public function entryList(Request $r, string $slug): JsonResponse
    {
        $c = Competition::query()->published()->with('prizes')->where('slug', $slug)->firstOrFail();
        $v = $this->state()->verity($c);
        abort_unless($c->hasDraw() && $v && in_array($v->status, ['drawn', 'carried'], true), 404);
        $per = 100;
        $page = max(1, (int) $r->query('page', 1));
        $q = Entry::query()->where('verity_entries.competition_id', $v->id)->join('verity_entry_groups', 'verity_entry_groups.id', '=', 'verity_entries.entry_group_id')
            ->whereNull('verity_entry_groups.withdrawn_at')->orderBy('verity_entries.number');
        if (ctype_digit((string) $r->query('q'))) {
            $q->where('verity_entries.number', (int) $r->query('q'));
        }
        $total = (clone $q)->count();
        $rows = $q->skip(($page - 1) * $per)->take($per + 1)->get(['verity_entries.number', 'verity_entries.source', 'verity_entry_groups.owner_ref']);

        return response()->json([
            'competition' => $this->present()->summary($c),
            'data' => $rows->take($per)->map(fn ($e) => ['ticket' => (int) $e->number, 'name' => $this->maskedName($e->owner_ref), 'source' => in_array($e->source, ['postal', 'free'], true) ? $e->source : 'paid'])->values(),
            'total' => $total,
            'hasMore' => $rows->count() > $per,
        ]);
    }

    public function page(string $slug): JsonResponse
    {
        $p = Page::query()->findOrFail($slug);
        preg_match_all('/<h2[^>]*id="([^"]+)"[^>]*>(.*?)<\/h2>/s', $p->html, $m, PREG_SET_ORDER);

        return response()->json([
            'title' => $p->title, 'updatedAt' => $p->updated_at?->toIso8601ZuluString(), 'version' => $p->version, 'html' => $p->html,
            'headings' => array_map(fn ($h) => ['id' => $h[1], 'text' => html_entity_decode(strip_tags($h[2]))], $m),
        ]);
    }

    public function contact(Request $r): JsonResponse
    {
        $d = $r->validate([
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email:rfc', 'max:255'],
            'topic' => ['required', 'string', 'max:60'],
            'message' => ['required', 'string', 'min:10', 'max:5000'],
        ]);
        $msg = ContactMessage::query()->create($d + ['ip' => $r->ip()]);
        if ($to = config('app.contact_inbox')) {
            // Plain text, to our own inbox only; the visitor's words are never sent back to them.
            Mail::raw("Contact form message #{$msg->id}\nFrom: {$d['name']} <{$d['email']}>\nTopic: {$d['topic']}\n\n{$d['message']}",
                fn ($m) => $m->to($to)->subject('Website message #'.$msg->id)->replyTo($d['email']));
        }

        return response()->json(null, 204);
    }

    /** "Liam O." for an account; "Postal entrant" otherwise. */
    private function publicName(string $ownerRef): string
    {
        $id = Fulfilment::userIdFromOwner($ownerRef);
        $u = $id ? User::query()->find($id, ['id', 'first_name', 'last_name', 'closed_at']) : null;

        return $u && ! $u->closed_at ? $u->publicName() : 'Postal entrant';
    }

    /** "L*** O." in entry lists. */
    private function maskedName(string $ownerRef): string
    {
        $name = $this->publicName($ownerRef);

        return $name === 'Postal entrant' ? $name : preg_replace('/^(\p{L})\p{L}*/u', '$1***', $name);
    }
}
