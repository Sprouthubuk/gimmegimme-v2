<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Presenters\CompetitionPresenter;
use App\Models\BoostPrize;
use App\Models\Competition;
use App\Models\ContactMessage;
use App\Models\Page;
use App\Models\PrizeBoost;
use App\Models\Setting;
use App\Models\User;
use App\Services\Bundles;
use App\Services\CompetitionState;
use App\Services\Fulfilment;
use App\Services\GimmeBoxPacker;
use App\Services\Settings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
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
        return new CompetitionPresenter($this->state(), new Bundles($this->state()));
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
            'metaPixelId' => preg_match('/^\d{10,20}$/', (string) Setting::get('meta_pixel_id')) ? Setting::get('meta_pixel_id') : null,
            // Switched-off features are null, so nothing of them shows anywhere.
            'gimmeBox' => Settings::gimmeBoxOn() ? [
                'available' => Cache::remember('gimme-box:available', 30, fn () => app(GimmeBoxPacker::class)->available()),
                'chipsPence' => Settings::gimmeBoxChips(),
                'minPence' => Settings::bounded('gimme_box_min_pence', 100, 100000),
                'maxPence' => max(Settings::bounded('gimme_box_min_pence', 100, 100000), Settings::bounded('gimme_box_max_pence', 100, 100000)),
                'bonusPct' => Settings::bounded('gimme_box_bonus_pct', 0, 100),
            ] : null,
            'referrals' => Settings::referralsOn() ? [
                'rewardType' => Setting::get('referral_reward_type') === 'credit' ? 'credit' : 'tickets',
                'rewardTickets' => Settings::bounded('referral_reward_tickets', 1, 1000),
                'rewardCreditPence' => Settings::bounded('referral_reward_credit_pence', 1, 100000),
                'minPurchasePence' => Settings::bounded('referral_min_purchase_pence', 0, 100000),
            ] : null,
        ]);
    }

    public function competitions(Request $r): JsonResponse
    {
        $list = Competition::query()->published()->with(['prizes', 'bundleTiers'])->where('closes_at', '>', now()->subDays(1))
            ->when(in_array($r->query('type'), ['instant', 'draw'], true), fn ($q) => $q->where('type', $r->query('type')))
            ->orderByDesc('featured')->orderBy('closes_at')->limit(200)->get()
            ->filter(fn (Competition $c) => in_array($this->state()->status($c), ['live', 'sold_out'], true))
            ->map(fn (Competition $c) => $this->present()->summary($c))->values();

        return response()->json(['data' => $list]);
    }

    public function competition(Request $r, string $slug): JsonResponse
    {
        $c = Competition::query()->published()->with(['prizes', 'bundleTiers'])->where('slug', $slug)->firstOrFail();

        return response()->json($this->present()->detail($c, $r->user()));
    }

    public function instantWinners(Request $r): JsonResponse
    {
        $limit = max(1, min(50, (int) $r->query('limit', 20)));
        $page = max(1, (int) $r->query('page', 1));
        $q = Winner::query()->where('type', 'instant')->where('status', 'active')->with('competition:id,ref,title')->orderByDesc('id')
            ->whereHas('entry', $this->seenOnly('verity_entries.entry_group_id'));
        $hosts = Competition::query()->published()->get(['id', 'verity_ref', 'title', 'game'])->keyBy('verity_ref');
        if ($game = $r->query('game')) {
            $refs = $hosts->where('game', $game)->keys();
            $q->whereHas('competition', fn ($w) => $w->whereIn('ref', $refs));
        }
        // Added (prize boost) wins join the feed too, newest first across both.
        $boost = BoostPrize::query()->whereNotNull('won_at')->with('competition:id,title,game')->orderByDesc('won_at')->orderByDesc('id')
            ->where($this->seenOnly('boost_prizes.won_group_id'));
        if ($game ?? null) {
            $boost->whereHas('competition', fn ($w) => $w->where('game', $game));
        }
        $total = (clone $q)->count() + (clone $boost)->count();
        $window = $page * $limit;
        $rows = $q->take($window)->get()->map(function (Winner $w) use ($hosts) {
            $h = $hosts->get($w->competition->ref);

            return [
                'id' => (string) $w->id, 'name' => $this->publicName($w->owner_ref), 'prizeName' => $w->prize_name, 'valuePence' => (int) $w->prize_value_pence,
                'game' => $h?->game, 'gameLabel' => CompetitionPresenter::GAME_LABELS[$h?->game] ?? null,
                'competitionTitle' => $h?->title ?? $w->competition->title, 'at' => $w->created_at->toIso8601ZuluString(),
            ];
        })->concat($boost->take($window)->get()->map(fn (BoostPrize $p) => [
            'id' => 'b'.$p->id, 'name' => $this->publicName((string) $p->won_owner_ref), 'prizeName' => $p->name, 'valuePence' => (int) $p->value_pence,
            'game' => $p->competition?->game, 'gameLabel' => CompetitionPresenter::GAME_LABELS[$p->competition?->game] ?? null,
            'competitionTitle' => $p->competition?->title, 'at' => $p->won_at->toIso8601ZuluString(),
        ]))->sortByDesc('at')->values()->slice(($page - 1) * $limit, $limit);

        return response()->json(['total' => $total, 'data' => $rows->values()]);
    }

    /**
     * A competition's prize boost, in full: the record, every added prize and its number, and the numbers that were
     * left out, so anyone can re-run GG-BOOST-1 (docs/prize-boosts.md) and get the same numbers.
     */
    public function prizeBoost(string $slug): JsonResponse
    {
        $c = Competition::query()->published()->where('slug', $slug)->firstOrFail();
        $boosts = PrizeBoost::query()->where('competition_id', $c->id)->with('prizes')->orderBy('id')->get();
        abort_if($boosts->isEmpty(), 404);

        return response()->json(['competition' => ['slug' => $c->slug, 'title' => $c->title, 'verityRef' => $c->verity_ref], 'data' => $boosts->map(fn ($b) => [
            'batch' => $b->batch, 'reason' => $b->reason, 'algorithm' => $b->algorithm, 'addedAt' => $b->added_at->toIso8601ZuluString(),
            'beacon' => ['source' => $b->beacon_source, 'round' => $b->beacon_round, 'randomness' => $b->beacon_randomness, 'signature' => $b->beacon_signature],
            'maxTickets' => (int) $b->max_tickets, 'issuedCount' => (int) $b->issued_count, 'issuedHash' => $b->issued_hash,
            'excludedHash' => $b->excluded_hash, 'excludedNumbers' => $b->excluded_numbers === '' ? [] : array_map('intval', explode(',', $b->excluded_numbers)),
            'verityTableHash' => $b->verity_table_hash,
            'prizes' => $b->prizes->map(fn ($p) => ['slot' => $p->slot, 'name' => $p->name, 'valuePence' => (int) $p->value_pence, 'ticket' => (int) $p->ticket_number])->values(),
        ])->values()]);
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

    /**
     * Every published competition's entry list, open from the moment it goes on sale: competitions still
     * selling first (closing soonest), then finished ones (most recent first). Not-yet-open ones are left out.
     */
    public function entryLists(): JsonResponse
    {
        $all = Competition::query()->published()->with('prizes')->where('closes_at', '>', now()->subDays(90))->get()
            ->filter(fn (Competition $c) => $this->state()->verity($c) !== null && $this->state()->status($c) !== 'scheduled');
        [$open, $done] = $all->partition(fn (Competition $c) => in_array($this->state()->status($c), ['live', 'sold_out'], true));
        $list = $open->sortBy('closes_at')->concat($done->sortByDesc('closes_at'))->take(100)
            ->map(fn (Competition $c) => $this->present()->summary($c))->values(); // no ticket counts: % sold only

        return response()->json(['data' => $list]);
    }

    /** One competition's confirmed tickets, live while it is on sale. Instant-win tickets show the prize they won. */
    public function entryList(Request $r, string $slug): JsonResponse
    {
        $c = Competition::query()->published()->with('prizes')->where('slug', $slug)->firstOrFail();
        $v = $this->state()->verity($c);
        abort_unless($v !== null, 404);
        $per = 100;
        $page = max(1, min(10000, (int) $r->query('page', 1)));
        $q = Entry::query()->where('verity_entries.competition_id', $v->id)
            ->join('verity_entry_groups', 'verity_entry_groups.id', '=', 'verity_entries.entry_group_id')
            ->leftJoin('verity_instant_tickets', 'verity_instant_tickets.id', '=', 'verity_entries.instant_ticket_id')
            ->leftJoin('verity_instant_prizes', 'verity_instant_prizes.id', '=', 'verity_instant_tickets.instant_prize_id')
            ->leftJoin('boost_prizes', fn ($j) => $j->on('boost_prizes.ticket_number', '=', 'verity_entries.number')->where('boost_prizes.competition_id', '=', $c->id))
            ->whereNull('verity_entry_groups.withdrawn_at')->orderBy('verity_entries.number');
        if (ctype_digit((string) $r->query('q'))) {
            $q->where('verity_entries.number', (int) $r->query('q'));
        }
        $rows = $q->skip(($page - 1) * $per)->take($per + 1)
            ->get(['verity_entries.number', 'verity_entries.source', 'verity_entries.entry_group_id', 'verity_entry_groups.owner_ref',
                DB::raw('COALESCE(verity_instant_prizes.name, boost_prizes.name) as prize_name')]);
        $names = $this->names($rows->take($per)->pluck('owner_ref'));
        $unseen = $this->unseenGroups($rows->take($per)->whereNotNull('prize_name')->pluck('entry_group_id'));

        return response()->json([
            'competition' => $this->present()->summary($c),
            'data' => $rows->take($per)->map(fn ($e) => [
                'ticket' => (int) $e->number, 'name' => $this->mask($names[$e->owner_ref] ?? 'Postal entrant'),
                'source' => in_array($e->source, ['postal', 'free'], true) ? $e->source : 'paid',
                'prizeName' => isset($unseen[(int) $e->entry_group_id]) ? null : $e->prize_name,
            ])->values(),
            // No total: players see % sold only, never a count of tickets.
            'hasMore' => $rows->count() > $per,
        ]);
    }

    /**
     * Every instant prize's winning ticket number, public from publish (owner's decision, 18 Nov 2026). Safe
     * because Verity hands out random unsold numbers at payment, never in order (it refuses sequential
     * numbering with instant wins), so knowing a number never helps anyone get it. A prize is won once
     * its ticket is sold. The seed that made the list is still revealed only when the competition ends.
     */
    public function winningNumbers(Request $r, string $slug): JsonResponse
    {
        $c = Competition::query()->published()->with('prizes')->where('slug', $slug)->firstOrFail();
        $v = $this->state()->verity($c);
        abort_unless($c->isInstant() && $v !== null, 404);
        $per = 100;
        $page = max(1, min(10000, (int) $r->query('page', 1)));
        $sold = fn ($j) => $j->on('verity_entries.competition_id', '=', 'verity_instant_tickets.competition_id')
            ->on('verity_entries.number', '=', 'verity_instant_tickets.ticket_number');
        $verityRows = DB::table('verity_instant_tickets')->where('verity_instant_tickets.competition_id', $v->id)
            ->join('verity_instant_prizes', 'verity_instant_prizes.id', '=', 'verity_instant_tickets.instant_prize_id')
            ->leftJoin('verity_entries', $sold)
            ->leftJoin('verity_entry_groups', fn ($j) => $j->on('verity_entry_groups.id', '=', 'verity_entries.entry_group_id')->whereNull('verity_entry_groups.withdrawn_at'))
            ->select(['verity_instant_tickets.ticket_number', 'verity_instant_prizes.name', 'verity_instant_prizes.value_pence', 'verity_instant_prizes.meta',
                'verity_entry_groups.id as group_id', 'verity_entry_groups.owner_ref', 'verity_entry_groups.created_at as won_at', DB::raw('NULL as added_at')]);
        // Added (prize boost) prizes, listed with Verity's from the moment they're added, labelled with when.
        $boostRows = DB::table('boost_prizes')->where('boost_prizes.competition_id', $c->id)
            ->select(['boost_prizes.ticket_number', 'boost_prizes.name', 'boost_prizes.value_pence', DB::raw("'{\"type\":\"site_credit\"}' as meta"),
                'boost_prizes.won_group_id as group_id', 'boost_prizes.won_owner_ref as owner_ref', 'boost_prizes.won_at', 'boost_prizes.added_at']);
        $base = DB::query()->fromSub($verityRows->unionAll($boostRows), 'p');
        $total = (clone $base)->count();
        $won = (clone $base)->whereNotNull('p.group_id')->count();
        $q = clone $base;
        match ($r->query('show')) {
            'won' => $q->whereNotNull('p.group_id'),
            'left' => $q->whereNull('p.group_id'),
            default => null,
        };
        if (ctype_digit((string) $r->query('q'))) {
            $q->where('p.ticket_number', (int) $r->query('q'));
        }
        if (is_string($r->query('prize')) && $r->query('prize') !== '') {
            $q->where('p.name', mb_substr($r->query('prize'), 0, 191));
        }
        $matching = (clone $q)->count();
        $rows = $q->orderByDesc('p.value_pence')->orderBy('p.ticket_number')
            ->skip(($page - 1) * $per)->take($per + 1)
            ->get(['p.ticket_number', 'p.name', 'p.value_pence', 'p.meta', 'p.group_id', 'p.owner_ref', 'p.won_at', 'p.added_at']);
        $names = $this->names($rows->take($per)->pluck('owner_ref')->filter());
        $unseen = $this->unseenGroups($rows->take($per)->pluck('group_id'));

        return response()->json([
            'competition' => $this->present()->summary($c),
            'data' => $rows->take($per)->map(fn ($t) => [
                'ticket' => (int) $t->ticket_number, 'prizeName' => $t->name, 'valuePence' => (int) $t->value_pence,
                'type' => json_decode((string) $t->meta, true)['type'] ?? 'site_credit',
                'won' => $t->group_id !== null,
                'winnerName' => $t->group_id !== null && ! isset($unseen[(int) $t->group_id]) ? ($names[$t->owner_ref] ?? 'Postal entrant') : null,
                'wonAt' => $t->won_at ? Carbon::parse($t->won_at)->toIso8601ZuluString() : null,
                'addedAt' => $t->added_at ? Carbon::parse($t->added_at)->toIso8601ZuluString() : null,
            ])->values(),
            'total' => $total,
            'won' => $won,
            'matching' => $matching,
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
        // The form's hidden "website" field is only ever filled in by bots: answer as if sent, save nothing.
        if (trim((string) $r->input('website')) !== '') {
            return response()->json(null, 204);
        }
        $d = $r->validate([
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email:rfc', 'max:255'],
            'topic' => ['required', 'string', 'max:60'],
            'message' => ['required', 'string', 'min:10', 'max:5000'],
        ]);
        $msg = ContactMessage::query()->create($d + ['ip' => $r->ip()]);
        if ($to = config('app.contact_inbox')) {
            // Plain text, to our own inbox only; the visitor's words are never sent back to them.
            try {
                Mail::raw("Contact form message #{$msg->id}\nFrom: {$d['name']} <{$d['email']}>\nTopic: {$d['topic']}\n\n{$d['message']}",
                    fn ($m) => $m->to($to)->subject('Website message #'.$msg->id)->replyTo($d['email']));
            } catch (\Throwable $e) {
                Log::warning('Contact message saved but not emailed', ['id' => $msg->id]); // it is in the admin
            }
        }

        return response()->json(null, 204);
    }

    /**
     * A win stays private until its player has watched the reveal game, or for an hour if they haven't:
     * a win the player hasn't seen yet isn't named in the winners feed, the winning numbers or the entry
     * list, so the website never spoils their game. Postal entries have no reveal and show at once.
     * Adds "and the entry group in $groupIdColumn is not an unseen paid win" to a query.
     */
    private function seenOnly(string $groupIdColumn): \Closure
    {
        return fn ($q) => $q->whereNotExists(fn ($s) => $s->selectRaw('1')->from('order_lines')
            ->join('verity_entry_groups as seen_g', 'seen_g.reference', '=', 'order_lines.entry_group_ref')
            ->whereColumn('seen_g.id', $groupIdColumn)->whereNull('order_lines.revealed_at')
            ->where('seen_g.created_at', '>', now()->subHour()));
    }

    /** Group ids among $ids that are paid wins their player hasn't seen yet (see seenOnly). @return array<int, true> */
    private function unseenGroups(Collection $ids): array
    {
        $ids = $ids->filter()->unique()->values();

        return $ids->isEmpty() ? [] : DB::table('order_lines')->join('verity_entry_groups', 'verity_entry_groups.reference', '=', 'order_lines.entry_group_ref')
            ->whereIn('verity_entry_groups.id', $ids)->whereNull('order_lines.revealed_at')->where('verity_entry_groups.created_at', '>', now()->subHour())
            ->pluck('verity_entry_groups.id')->mapWithKeys(fn ($id) => [(int) $id => true])->all();
    }

    /** "Liam O." for an account; "Postal entrant" otherwise. */
    private function publicName(string $ownerRef): string
    {
        return $this->names(collect([$ownerRef]))[$ownerRef] ?? 'Postal entrant';
    }

    /**
     * Public names for many owner refs in one query: "Liam O." for an open account. Postal entrants and
     * closed accounts are left out (callers show "Postal entrant").
     *
     * @return array<string, string>
     */
    private function names(Collection $ownerRefs): array
    {
        $ids = $ownerRefs->unique()->mapWithKeys(fn ($ref) => [$ref => Fulfilment::userIdFromOwner((string) $ref)])->filter();
        $users = $ids->isEmpty() ? collect() : User::query()->whereIn('id', $ids->values())->whereNull('closed_at')->get(['id', 'first_name', 'last_name', 'name_hidden'])->keyBy('id');

        return $ids->map(fn ($id) => $users->get($id)?->publicName())->filter()->all();
    }

    /** "L*** O." in entry lists. */
    private function mask(string $name): string
    {
        return in_array($name, ['Postal entrant', 'Anonymous'], true) ? $name : preg_replace('/^(\p{L})\p{L}*/u', '$1***', $name);
    }
}
