<?php

namespace App\Support;

use App\Models\Competition;
use App\Models\LedgerEntry;
use App\Models\Order;
use App\Models\OrderLine;
use App\Models\Setting;
use App\Models\User;
use App\Models\Withdrawal;
use App\Services\Wallet;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Sprouthub\Verity\Models\Winner;

/**
 * Read-only figures for the admin: a player's money and history, wins, money owed and flows, and per-competition
 * results. Nothing here writes anything. Wins come from Verity's winners (read only, never written); money from the
 * wallet ledger and orders. "Paid in" means real money: card payments for tickets and top ups.
 */
final class Reports
{
    public const BIG_WIN_DEFAULT_PENCE = 10000;

    public static function bigWinPence(): int
    {
        return max(100, (int) (Setting::get('big_win_alert_pence') ?? self::BIG_WIN_DEFAULT_PENCE));
    }

    /** SQL for "this winner/entry belongs to users.id", portable between SQLite and MySQL. */
    public static function ownerOf(string $column, string $userIdColumn = 'users.id'): string
    {
        return DB::connection()->getDriverName() === 'sqlite'
            ? "{$column} = ('user:' || {$userIdColumn})"
            : "{$column} = CONCAT('user:', {$userIdColumn})";
    }

    // ---- One player -------------------------------------------------------------------------------------------

    /** @return array<string, int|string|null> */
    public static function playerMoney(User $u): array
    {
        $b = app(Wallet::class)->balances($u);
        $paid = Order::query()->where('user_id', $u->id)->where('status', 'paid');
        $tickets = (clone $paid)->where('order_type', 'tickets');
        $since = fn (string $ago) => (int) Order::query()->where('user_id', $u->id)->where('status', 'paid')->where('paid_at', '>=', now()->sub($ago))->sum('card_pence');
        $bonusExpiry = LedgerEntry::query()->where('user_id', $u->id)->where('bucket', 'bonus')->where('direction', 'credit')
            ->where('expires_at', '>', now())->min('expires_at');

        return [
            'deposit' => (int) ($b['deposit'] ?? 0), 'bonus' => (int) ($b['bonus'] ?? 0), 'winnings' => (int) ($b['winnings'] ?? 0),
            'bonusExpires' => $bonusExpiry,
            'toppedUp' => (int) (clone $paid)->where('order_type', 'deposit')->sum('card_pence'),
            'cardOnTickets' => (int) (clone $tickets)->sum('card_pence'),
            'walletOnTickets' => (int) (clone $tickets)->sum('wallet_pence'),
            'ticketOrders' => (clone $tickets)->count(),
            'won' => self::wonPence($u->id),
            'withdrawn' => (int) Withdrawal::query()->where('user_id', $u->id)->where('status', 'paid')->sum('amount_pence'),
            'withdrawalPending' => (int) Withdrawal::query()->where('user_id', $u->id)->where('status', 'requested')->sum('amount_pence'),
            'paidIn24h' => $since('24 hours'), 'paidIn7d' => $since('7 days'), 'paidIn30d' => $since('30 days'),
            'lastOrderAt' => (clone $paid)->max('paid_at'),
        ];
    }

    /** Total value of everything this player has won (cash, credit and prizes), from Verity's winners. */
    public static function wonPence(int $userId): int
    {
        return (int) Winner::query()->where('owner_ref', 'user:'.$userId)->where('status', 'active')->sum('prize_value_pence');
    }

    /** @return Collection<int, object> the player's wins, newest first (Verity winners, with the competition). */
    public static function playerWins(User $u, int $limit = 200): Collection
    {
        return self::winsQuery()->where('w.owner_ref', 'user:'.$u->id)->limit($limit)->get();
    }

    /**
     * Competitions the player has tickets in: from Verity's entry groups (paid, bundle, voucher and postal tickets
     * alike), with the ticket numbers the site holds for their orders.
     *
     * @return list<array{title: string, slug: ?string, tickets: int, sources: string, numbers: list<int>, won: int, last: ?string}>
     */
    public static function playerEntries(User $u): array
    {
        $groups = DB::table('verity_entry_groups as g')->join('verity_competitions as vc', 'vc.id', '=', 'g.competition_id')
            ->where('g.owner_ref', 'user:'.$u->id)->whereNull('g.withdrawn_at')
            ->select('vc.ref', 'vc.title', 'g.quantity', 'g.source', 'g.created_at')->get()->groupBy('ref');
        $local = Competition::query()->whereIn('verity_ref', $groups->keys())->get(['id', 'slug', 'title', 'verity_ref'])->keyBy('verity_ref');
        $numbers = OrderLine::query()->join('orders', 'orders.id', '=', 'order_lines.order_id')
            ->where('orders.user_id', $u->id)->where('orders.status', 'paid')->whereNotNull('order_lines.tickets')
            ->get(['order_lines.competition_id', 'order_lines.tickets'])->groupBy('competition_id')
            ->map(fn ($ls) => $ls->flatMap(fn ($l) => (array) $l->tickets)->map(fn ($n) => (int) $n)->sort()->values()->all());
        $wins = Winner::query()->where('verity_winners.owner_ref', 'user:'.$u->id)->where('verity_winners.status', 'active')
            ->join('verity_competitions as vc', 'vc.id', '=', 'verity_winners.competition_id')
            ->selectRaw('vc.ref, COUNT(*) AS n')->groupBy('vc.ref')->pluck('n', 'ref');

        return $groups->map(function ($gs, $ref) use ($local, $numbers, $wins) {
            $c = $local->get($ref);

            return [
                'title' => $c?->title ?? (string) $gs->first()->title,
                'slug' => $c?->slug,
                'tickets' => (int) $gs->sum('quantity'),
                'sources' => $gs->pluck('source')->filter()->unique()->map(fn ($s) => ucfirst((string) $s))->implode(', '),
                'numbers' => $c ? ($numbers[$c->id] ?? []) : [],
                'won' => (int) ($wins[$ref] ?? 0),
                'last' => (string) $gs->max('created_at'),
            ];
        })->sortByDesc('last')->values()->all();
    }

    // ---- Wins ---------------------------------------------------------------------------------------------------

    /** Every win (Verity winners, active), joined to the competition and, when it's one of ours, the player. */
    public static function winsQuery(): \Illuminate\Database\Query\Builder
    {
        return DB::table('verity_winners as w')
            ->join('verity_competitions as vc', 'vc.id', '=', 'w.competition_id')
            ->leftJoin('users', fn ($j) => $j->whereRaw(self::ownerOf('w.owner_ref')))
            ->where('w.status', 'active')
            ->select('w.id', 'w.type', 'w.prize_name', 'w.prize_value_pence', 'w.created_at', 'w.owner_ref', 'vc.title as competition', 'vc.ref as competition_ref',
                'users.id as user_id', 'users.first_name', 'users.last_name', 'users.email')
            ->orderByDesc('w.created_at')->orderByDesc('w.id');
    }

    /** @return Collection<int, object> wins at or above the big-win line since $since. */
    public static function bigWins(Carbon $since, int $limit = 20): Collection
    {
        return self::winsQuery()->where('w.prize_value_pence', '>=', self::bigWinPence())->where('w.created_at', '>=', $since)->limit($limit)->get();
    }

    // ---- Money --------------------------------------------------------------------------------------------------

    /** @return array{deposit: int, bonus: int, winnings: int, withdrawalsWaiting: int, playersWithWinnings: int} what players hold now. */
    public static function owed(): array
    {
        $by = LedgerEntry::query()->selectRaw("bucket, SUM(CASE WHEN direction = 'credit' THEN amount_pence ELSE -amount_pence END) AS total")
            ->groupBy('bucket')->pluck('total', 'bucket');
        $holders = LedgerEntry::query()->where('bucket', 'winnings')
            ->selectRaw("user_id, SUM(CASE WHEN direction = 'credit' THEN amount_pence ELSE -amount_pence END) AS total")
            ->groupBy('user_id')->get()->filter(fn ($r) => (int) $r->total > 0)->count();

        return [
            'deposit' => (int) ($by['deposit'] ?? 0), 'bonus' => (int) ($by['bonus'] ?? 0), 'winnings' => (int) ($by['winnings'] ?? 0),
            'withdrawalsWaiting' => (int) Withdrawal::query()->where('status', 'requested')->sum('amount_pence'),
            'playersWithWinnings' => $holders,
        ];
    }

    /**
     * Money in and out per UK day, oldest first: card in (tickets and top ups), tickets bought from wallets,
     * winnings credited (cash and credit prizes) and withdrawals paid. Summed in PHP so it works on any database.
     *
     * @return array<string, array{cardIn: int, walletSpend: int, winningsCredited: int, withdrawalsPaid: int, orders: int}>
     */
    public static function daily(int $days): array
    {
        $out = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $out[now('Europe/London')->subDays($i)->format('Y-m-d')] = ['cardIn' => 0, 'walletSpend' => 0, 'winningsCredited' => 0, 'withdrawalsPaid' => 0, 'orders' => 0];
        }
        $from = now('Europe/London')->startOfDay()->subDays($days - 1)->utc();
        $day = fn ($t) => Carbon::parse($t)->setTimezone('Europe/London')->format('Y-m-d');
        Order::query()->where('status', 'paid')->where('paid_at', '>=', $from)->get(['paid_at', 'card_pence', 'wallet_pence', 'order_type'])
            ->each(function (Order $o) use (&$out, $day) {
                $k = $day($o->paid_at);
                if (! isset($out[$k])) {
                    return;
                }
                $out[$k]['cardIn'] += (int) $o->card_pence;
                if ($o->order_type === 'tickets') {
                    $out[$k]['walletSpend'] += (int) $o->wallet_pence;
                    $out[$k]['orders']++;
                }
            });
        LedgerEntry::query()->where('bucket', 'winnings')->where('direction', 'credit')->where('reference', 'like', 'verity-winner:%')
            ->where('created_at', '>=', $from)->get(['created_at', 'amount_pence'])
            ->each(function ($e) use (&$out, $day) {
                if (isset($out[$k = $day($e->created_at)])) {
                    $out[$k]['winningsCredited'] += (int) $e->amount_pence;
                }
            });
        Withdrawal::query()->where('status', 'paid')->where('decided_at', '>=', $from)->get(['decided_at', 'amount_pence'])
            ->each(function ($w) use (&$out, $day) {
                if (isset($out[$k = $day($w->decided_at)])) {
                    $out[$k]['withdrawalsPaid'] += (int) $w->amount_pence;
                }
            });

        return $out;
    }

    /** @return array<string, array{cardIn: int, walletSpend: int, winningsCredited: int, withdrawalsPaid: int, orders: int}> by week (Mon), newest last. */
    public static function weekly(int $weeks): array
    {
        $out = [];
        foreach (self::daily($weeks * 7) as $d => $row) {
            $k = Carbon::parse($d, 'Europe/London')->startOfWeek()->format('Y-m-d');
            foreach ($row as $f => $v) {
                $out[$k][$f] = ($out[$k][$f] ?? 0) + $v;
            }
        }

        return $out;
    }

    /** @return Collection<int, object> today's biggest buyers (card + wallet on tickets), most first. */
    public static function topBuyers(Carbon $since, int $limit = 5): Collection
    {
        return Order::query()->join('users', 'users.id', '=', 'orders.user_id')
            ->where('orders.status', 'paid')->where('orders.order_type', 'tickets')->where('orders.paid_at', '>=', $since)
            ->groupBy('users.id', 'users.first_name', 'users.last_name', 'users.email')
            ->selectRaw('users.id, users.first_name, users.last_name, users.email, SUM(orders.total_pence) AS spent, COUNT(*) AS orders')
            ->orderByDesc('spent')->limit($limit)->get();
    }

    // ---- Competitions -------------------------------------------------------------------------------------------

    /** Competitions with revenue, players, prizes paid and value still to win, ready to sort in a table. */
    public static function competitionsQuery(): Builder
    {
        $paidLines = fn ($q) => $q->from('order_lines')->join('orders', 'orders.id', '=', 'order_lines.order_id')
            ->where('orders.status', 'paid')->whereColumn('order_lines.competition_id', 'competitions.id');

        return Competition::query()->whereNotNull('verity_ref')
            ->select('competitions.*')
            ->selectSub(fn ($q) => $paidLines($q)->selectRaw('COALESCE(SUM(order_lines.line_pence), 0)'), 'revenue_pence')
            ->selectSub(fn ($q) => $paidLines($q)->selectRaw('COUNT(DISTINCT orders.user_id)'), 'buyers')
            ->selectSub(fn ($q) => $q->from('verity_winners as w')->join('verity_competitions as vc', 'vc.id', '=', 'w.competition_id')
                ->whereColumn('vc.ref', 'competitions.verity_ref')->where('w.status', 'active')->selectRaw('COALESCE(SUM(w.prize_value_pence), 0)'), 'won_pence')
            ->selectSub(fn ($q) => $q->from('verity_instant_prizes as p')->join('verity_competitions as vc', 'vc.id', '=', 'p.competition_id')
                ->whereColumn('vc.ref', 'competitions.verity_ref')->selectRaw('COALESCE(SUM(p.value_pence * p.quantity), 0)'), 'instant_pool_pence')
            ->selectSub(fn ($q) => $q->from('verity_competitions as vc')->whereColumn('vc.ref', 'competitions.verity_ref')->select('vc.tickets_sold'), 'tickets_sold');
    }

    /** @return Collection<int, object> a competition's biggest buyers. */
    public static function competitionTopBuyers(Competition $c, int $limit = 10): Collection
    {
        return OrderLine::query()->join('orders', 'orders.id', '=', 'order_lines.order_id')->join('users', 'users.id', '=', 'orders.user_id')
            ->where('orders.status', 'paid')->where('order_lines.competition_id', $c->id)
            ->groupBy('users.id', 'users.first_name', 'users.last_name', 'users.email')
            ->selectRaw('users.id, users.first_name, users.last_name, users.email, SUM(order_lines.line_pence) AS spent, SUM(order_lines.quantity) AS tickets')
            ->orderByDesc('spent')->limit($limit)->get();
    }
}
