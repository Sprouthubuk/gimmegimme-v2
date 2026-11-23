<?php

namespace App\Services;

use App\Models\BoostPrize;
use App\Models\Competition;
use App\Models\LedgerEntry;
use App\Models\PrizeBoost;
use App\Support\BigWinAlert;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Sprouthub\Verity\Engine\Drand;
use Sprouthub\Verity\Engine\HmacDrbg;
use Sprouthub\Verity\Engine\Sampler;
use Sprouthub\Verity\Models\Competition as VerityCompetition;
use Sprouthub\Verity\Models\Entry;
use Sprouthub\Verity\Services\Beacon;

/**
 * Prize boosts (owner, 23 Nov 2026): extra instant prizes added to a live instant-win competition.
 *
 * Verity's own prize table is fixed at publish and is never touched: the added prizes sit beside it, each on
 * its own ticket number, and are paid by the site when that ticket is issued (settle(), called by Fulfilment
 * and Postal straight after Verity issues the tickets, in the same transaction).
 *
 * How the numbers are chosen (GG-BOOST-1), so anyone can check them:
 *  1. Verity's competition row is locked (the same lock Verity takes to issue tickets), so no ticket can be
 *     issued while this runs. The issued ticket numbers and Verity's winning numbers are read under that lock.
 *  2. Candidates = every number 1..max_tickets that is neither issued nor one of Verity's winning numbers,
 *     ascending.
 *  3. A drand quicknet round that has not happened yet is chosen (after drand's own latest round and at least
 *     4 seconds ahead), and its BLS-verified randomness R is fetched once it is out.
 *  4. HMAC_DRBG (SP 800-90A, Verity's own HmacDrbg) with entropy = R (32 bytes), nonce = SHA-256("GG-BOOST-1|nonce|"
 *     ref "|" batch), personalisation = "GG-BOOST-1|" ref "|" batch; then Verity's Sampler::firstK picks k
 *     distinct candidate positions (Fisher–Yates, no modulo bias). Slot s (prizes in the batch order, biggest
 *     first) gets candidates[pick s].
 * The record (prize_boosts) keeps the round, R, its signature and hashes of the issued and excluded numbers.
 */
final class PrizeBoosts
{
    public const ALGORITHM = 'GG-BOOST-1';

    public function __construct(private Wallet $wallet, private CompetitionState $state) {}

    /** @return array{reason: string, competitions: array<string, list<array{0:int,1:int,2:string}>>} */
    public static function batch(string $batch): array
    {
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $batch) || ! is_file($file = resource_path("boosts/{$batch}.php"))) {
            throw new RuntimeException("No prize boost list for {$batch} (resources/boosts/{$batch}.php).");
        }

        return require $file;
    }

    /** Figures for one competition, before (and, when already added, after) its boost. Read only. */
    public function report(Competition $c, array $tiers, string $batch): array
    {
        $v = $this->state->verity($c);
        $max = (int) $c->max_tickets;
        $sold = $v ? (int) $v->tickets_sold : 0;
        $verityPrizes = $v ? DB::table('verity_instant_prizes')->where('competition_id', $v->id)->get(['value_pence', 'quantity']) : collect();
        $oldCount = (int) $verityPrizes->sum('quantity');
        $oldValue = (int) $verityPrizes->sum(fn ($p) => (int) $p->value_pence * (int) $p->quantity);
        $addCount = array_sum(array_map(fn ($t) => (int) $t[0], $tiers));
        $addValue = array_sum(array_map(fn ($t) => (int) $t[0] * (int) $t[1], $tiers));
        $revenue = $max * (int) $c->price_pence;
        $eligible = $v ? count(self::candidates($max,
            Entry::query()->where('competition_id', $v->id)->pluck('number')->map(fn ($n) => (int) $n)->all(),
            DB::table('verity_instant_tickets')->where('competition_id', $v->id)->pluck('ticket_number')->map(fn ($n) => (int) $n)->all())) : 0;
        $done = PrizeBoost::query()->where('competition_id', $c->id)->where('batch', $batch)->first();

        return [
            'slug' => $c->slug, 'title' => $c->title, 'status' => $this->state->status($c),
            'maxTickets' => $max, 'sold' => $sold, 'pricePence' => (int) $c->price_pence, 'sellOutPence' => $revenue,
            'oldCount' => $oldCount, 'oldValuePence' => $oldValue, 'oldPct' => $revenue ? round(100 * $oldValue / $revenue, 1) : 0.0,
            'addCount' => $addCount, 'addValuePence' => $addValue,
            'newCount' => $oldCount + $addCount, 'newValuePence' => $oldValue + $addValue,
            'newPct' => $revenue ? round(100 * ($oldValue + $addValue) / $revenue, 1) : 0.0,
            // With the end prizes too: the owner's 40% target.
            'oldPctAll' => $revenue ? round(100 * ($oldValue + (int) $c->end_prize_value_pence * $c->endPrizeCount()) / $revenue, 1) : 0.0,
            'newPctAll' => $revenue ? round(100 * ($oldValue + $addValue + (int) $c->end_prize_value_pence * $c->endPrizeCount()) / $revenue, 1) : 0.0,
            'oddsOld' => $oldCount ? round($max / $oldCount, 1) : null, 'oddsNew' => ($oldCount + $addCount) ? round($max / ($oldCount + $addCount), 1) : null,
            // Chance of at least one win per £1 spent, as the owner works it out: tickets per £1 ÷ odds (1 in X).
            'perPoundOld' => $max && (int) $c->price_pence ? round(100 * (100 / (int) $c->price_pence) * $oldCount / $max, 1) : null,
            'perPoundNew' => $max && (int) $c->price_pence ? round(100 * (100 / (int) $c->price_pence) * ($oldCount + $addCount) / $max, 1) : null,
            'endPrizePence' => (int) $c->end_prize_value_pence * $c->endPrizeCount(),
            'eligible' => $eligible,
            'problem' => $this->problem($c, $addCount, $batch),
            'added' => $done !== null,
        ];
    }

    /** Why a competition can't be boosted now, or null. */
    public function problem(Competition $c, int $k, string $batch): ?string
    {
        $v = $this->state->verity($c);
        if (PrizeBoost::query()->where('competition_id', $c->id)->where('batch', $batch)->exists()) {
            return 'already added';
        }
        if (! $c->isInstant() || ! $v) {
            return 'not a published instant-win competition';
        }
        if ($v->status !== 'live' || ! $c->closes_at || $c->closes_at->isPast() || $c->ended_at !== null) {
            return 'not on sale (status '.$v->status.')';
        }
        if ($k < 1) {
            return 'no prizes listed';
        }

        return null;
    }

    /**
     * Add one competition's boost. Returns the record, or a reason it was skipped. Safe to run again: a
     * competition that already has this batch is skipped.
     */
    public function apply(Competition $c, array $tiers, string $batch, string $reason): PrizeBoost|string
    {
        $slots = [];
        foreach ($tiers as [$qty, $value, $name]) {
            if ((int) $qty < 1 || (int) $value < 1 || trim((string) $name) === '') {
                throw new RuntimeException("Bad prize line for {$c->slug}.");
            }
            for ($i = 0; $i < (int) $qty; $i++) {
                $slots[] = ['name' => mb_substr(trim((string) $name), 0, 120), 'value' => (int) $value];
            }
        }
        if (($why = $this->problem($c, count($slots), $batch)) !== null) {
            return $why;
        }

        return DB::transaction(function () use ($c, $slots, $batch, $reason) {
            // The lock Verity takes to issue tickets (EntryAllocator): nothing is issued until we commit.
            $v = VerityCompetition::query()->lockForUpdate()->where('ref', $c->verity_ref)->firstOrFail();
            if (($why = $this->problem($c, count($slots), $batch)) !== null) {
                return $why;
            }
            $before = self::verityTableHash($v->id);
            $issued = Entry::query()->where('competition_id', $v->id)->orderBy('number')->pluck('number')->map(fn ($n) => (int) $n)->all();
            $verityNumbers = DB::table('verity_instant_tickets')->where('competition_id', $v->id)->orderBy('ticket_number')->pluck('ticket_number')->map(fn ($n) => (int) $n)->all();
            $candidates = self::candidates((int) $v->max_tickets, $issued, $verityNumbers);
            if (count($slots) > count($candidates)) {
                return 'only '.count($candidates).' unsold numbers left for '.count($slots).' prizes';
            }
            $excluded = array_values(array_unique(array_merge($issued, $verityNumbers)));
            sort($excluded);

            $beacon = $this->randomness();
            $picks = self::derive($beacon['randomness'], (string) $v->ref, $batch, $candidates, count($slots));

            // Nothing chosen may be issued or one of Verity's numbers (checked again, under the same lock).
            if (Entry::query()->where('competition_id', $v->id)->whereIn('number', $picks)->exists()
                || DB::table('verity_instant_tickets')->where('competition_id', $v->id)->whereIn('ticket_number', $picks)->exists()) {
                throw new RuntimeException("A chosen number for {$c->slug} is already taken: nothing added.");
            }
            $now = now();
            $boost = PrizeBoost::query()->create([
                'competition_id' => $c->id, 'batch' => $batch, 'reason' => $reason, 'algorithm' => self::ALGORITHM,
                'beacon_source' => $beacon['source'], 'beacon_round' => $beacon['round'], 'beacon_randomness' => $beacon['randomness'],
                'beacon_signature' => $beacon['signature'], 'max_tickets' => (int) $v->max_tickets,
                'issued_count' => count($issued), 'issued_hash' => self::listHash($issued),
                'excluded_count' => count($excluded), 'excluded_hash' => self::listHash($excluded), 'excluded_numbers' => implode(',', $excluded),
                'verity_table_hash' => $before, 'prize_count' => count($slots),
                'value_pence' => array_sum(array_column($slots, 'value')), 'added_at' => $now,
            ]);
            foreach ($slots as $i => $slot) {
                BoostPrize::query()->create([
                    'prize_boost_id' => $boost->id, 'competition_id' => $c->id, 'slot' => $i + 1, 'name' => $slot['name'],
                    'value_pence' => $slot['value'], 'type' => 'site_credit', 'ticket_number' => $picks[$i], 'added_at' => $now,
                ]);
            }
            if (self::verityTableHash($v->id) !== $before) {
                throw new RuntimeException("Verity's prize table for {$c->slug} changed: nothing added.");
            }

            return $boost;
        });
    }

    /** Numbers 1..max that are neither issued nor Verity winning numbers, ascending. */
    public static function candidates(int $max, array $issued, array $verityNumbers): array
    {
        $taken = array_fill_keys(array_merge($issued, $verityNumbers), true);
        $out = [];
        for ($n = 1; $n <= $max; $n++) {
            if (! isset($taken[$n])) {
                $out[] = $n;
            }
        }

        return $out;
    }

    /** GG-BOOST-1: the ticket number for each slot, in slot order. Pure: the same inputs always give the same numbers. */
    public static function derive(string $randomnessHex, string $ref, string $batch, array $candidates, int $k): array
    {
        if (! preg_match('/^[0-9a-f]{64}$/', $randomnessHex)) {
            throw new RuntimeException('The randomness must be 32 bytes of hex.');
        }
        $drbg = new HmacDrbg(hex2bin($randomnessHex), hash('sha256', self::ALGORITHM.'|nonce|'.$ref.'|'.$batch, true), self::ALGORITHM.'|'.$ref.'|'.$batch);

        return array_map(fn ($p) => $candidates[$p['value']], Sampler::firstK($drbg, count($candidates), $k));
    }

    /**
     * Re-run the choice from a boost's public record alone: the numbers it should have given, slot by slot.
     * Used by the public check (GET /api/competitions/{slug}/prize-boost) and competitions:boost-prizes --verify.
     */
    public static function rederive(PrizeBoost $b, string $ref): array
    {
        $excluded = $b->excluded_numbers === '' ? [] : array_map('intval', explode(',', $b->excluded_numbers));
        if (self::listHash($excluded) !== $b->excluded_hash) {
            throw new RuntimeException('The left-out numbers don\'t match their fingerprint.');
        }

        return self::derive($b->beacon_randomness, $ref, $b->batch, self::candidates((int) $b->max_tickets, $excluded, []), (int) $b->prize_count);
    }

    public static function listHash(array $numbers): string
    {
        return hash('sha256', implode("\n", $numbers));
    }

    /** SHA-256 over Verity's prizes and winning numbers for a competition: the same before and after, or nothing is added. */
    public static function verityTableHash(int $verityId): string
    {
        $prizes = DB::table('verity_instant_prizes')->where('competition_id', $verityId)->orderBy('id')->get(['id', 'key', 'name', 'value_pence', 'quantity'])
            ->map(fn ($p) => implode('|', [$p->id, $p->key, $p->name, $p->value_pence, $p->quantity]))->implode("\n");
        $tickets = DB::table('verity_instant_tickets')->where('competition_id', $verityId)->orderBy('ticket_number')->get(['ticket_number', 'instant_prize_id'])
            ->map(fn ($t) => $t->ticket_number.'|'.$t->instant_prize_id)->implode("\n");

        return hash('sha256', $prizes."\n--\n".$tickets);
    }

    /**
     * A drand round that is still in the future when it's chosen (we hold the lock), fetched and BLS-verified once
     * it's out. Off production with no drand beacon configured (laptops, tests): local randomness, recorded as such.
     *
     * @return array{source: string, round: ?int, randomness: string, signature: ?string}
     */
    private function randomness(): array
    {
        $beacon = app(Beacon::class);
        if (! $beacon->usesDrand()) {
            if (app()->isProduction()) {
                throw new RuntimeException('The live site needs the drand beacon for a prize boost.');
            }

            return ['source' => 'local-demo', 'round' => null, 'randomness' => bin2hex(random_bytes(32)), 'signature' => null];
        }
        $latest = $beacon->latestPublished()['round'] ?? 0;
        $round = max(Drand::roundAt(now()->getTimestamp() + 4), $latest + 2);
        // Sales wait while we hold the lock, so give up (nothing is added, run it again) after 25 seconds.
        $deadline = microtime(true) + 25;
        $error = null;
        while (microtime(true) < $deadline) {
            $wait = Drand::roundTime($round) - now()->getTimestamp();
            if ($wait > 0) {
                usleep((int) (min($wait + 1, 10) * 1e6));
            }
            try {
                $r = $beacon->fetchVerified($round);

                return ['source' => $r['source'], 'round' => $round, 'randomness' => $r['randomness'], 'signature' => $r['signature']];
            } catch (\Throwable $e) {
                $error = $e;
                usleep(1500000);
            }
        }
        throw new RuntimeException('drand round '.$round.' could not be fetched in time, so nothing was added (run it again): '.$error?->getMessage());
    }

    /**
     * Pay any added prize sitting on a ticket Verity has just issued to this entry group. Call straight after
     * Verity issues the tickets, in the same transaction (Fulfilment, Postal). Safe to repeat: a prize is won
     * once and paid once (reference boost-prize:{id}).
     */
    public function settle(Competition $c, int $groupId, string $ownerRef, ?string $orderId = null): void
    {
        if (! $c->isInstant() || ! BoostPrize::query()->where('competition_id', $c->id)->exists()) {
            return;
        }
        $entries = Entry::query()->where('entry_group_id', $groupId)->pluck('id', 'number');
        if ($entries->isEmpty()) {
            return;
        }
        $userId = Fulfilment::userIdFromOwner($ownerRef);
        $prizes = BoostPrize::query()->where('competition_id', $c->id)->whereIn('ticket_number', $entries->keys())->lockForUpdate()->get();
        foreach ($prizes as $p) {
            if ($p->won_at === null) {
                $p->forceFill(['won_entry_id' => $entries[$p->ticket_number], 'won_group_id' => $groupId, 'won_owner_ref' => $ownerRef,
                    'won_user_id' => $userId, 'won_at' => now()])->save();
            }
            if ($p->won_owner_ref !== $ownerRef || $userId === null) {
                continue; // someone else's win (never: a number is issued once), or a postal entrant with no account yet
            }
            if (! LedgerEntry::query()->where('reference', 'boost-prize:'.$p->id)->exists()) {
                $this->wallet->credit($userId, 'winnings', $p->value_pence, 'Instant win · '.$p->name, 'boost-prize:'.$p->id, $orderId);
                BigWinAlert::checkBoost($p, $userId);
            }
        }
    }

    /** The added prizes on these ticket numbers that this owner has won, by number: for the reveal and account pages. */
    public static function winsByTicket(Competition $c, array $numbers): array
    {
        if (! $numbers) {
            return [];
        }

        return BoostPrize::query()->where('competition_id', $c->id)->whereIn('ticket_number', $numbers)->whereNotNull('won_at')
            ->get()->mapWithKeys(fn (BoostPrize $p) => [$p->ticket_number => ['name' => $p->name, 'value' => $p->value_pence, 'key' => 'boost:'.$p->id, 'addedAt' => $p->added_at->toIso8601ZuluString()]])->all();
    }
}
