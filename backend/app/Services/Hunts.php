<?php

namespace App\Services;

use App\Models\AdminAction;
use App\Models\Competition;
use App\Models\HuntClaim;
use App\Models\User;
use App\Notifications\HuntPrizeRevealed;
use App\Notifications\HuntReminder;
use App\Notifications\HuntSymbolFound;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Sprouthub\Verity\Facades\Verity;
use Sprouthub\Verity\Models\Competition as VerityCompetition;
use Sprouthub\Verity\Models\Hunt;
use Sprouthub\Verity\Models\Winner;

/**
 * Mystery Hunts (owner, 26 Nov 2026; docs/mystery-hunt.md).
 *
 *  - At publish, Verity seals which hidden prize is behind each number 1 … N (spec §18), N being the number of symbols
 *    in the instant-win table. Nobody can see the map, admins included, until the hunt ends.
 *  - A ticket that wins a symbol is a claim (found), with a deadline (hunt_claim_hours, default 48).
 *  - The player tells us a number (Facebook group or email); an admin enters it on the Hunt Board. Verity reveals that
 *    one prize, and it is paid at once, once: cash to winnings, ticket credit to bonus (expires).
 *  - A claim not picked by its deadline is not won. Once the competition has closed and no claim is open, the seed and
 *    the whole map are published.
 */
final class Hunts
{
    public const REMIND_HOURS = 12;

    public function __construct(private Wallet $wallet) {}

    /** @return list<string> what stops a hunt competition being published */
    public function problems(Competition $c): array
    {
        $p = [];
        $symbols = $c->prizes()->where('type', 'hunt_symbol')->get();
        if ($symbols->count() !== 1) {
            $p[] = 'A Mystery Hunt needs exactly one prize of type "Hunt symbol".';
        } elseif ((int) $symbols->first()->value_pence !== 0) {
            $p[] = 'The hunt symbol prize is worth £0: its value is the prize behind the number picked.';
        }
        $hidden = $c->huntPrizes()->get();
        if ($hidden->isEmpty()) {
            $p[] = 'Add the prizes hidden behind the symbols.';
        }
        if ($hidden->contains(fn ($h) => $h->quantity < 1 || $h->value_pence < 1 || ! in_array($h->type, ['cash', 'ticket_credit'], true) || trim((string) $h->name) === '')) {
            $p[] = 'Every hidden prize needs a name, a value, a quantity and a type (cash or ticket credit).';
        }
        if ($symbols->count() === 1 && (int) $hidden->sum('quantity') !== (int) $symbols->first()->quantity) {
            $p[] = 'There are '.(int) $symbols->first()->quantity.' symbols but '.(int) $hidden->sum('quantity').' hidden prizes: they must match.';
        }
        if ((int) $c->hunt_claim_hours < 1 || (int) $c->hunt_claim_hours > 336) {
            $p[] = 'The claim window must be 1 to 336 hours.';
        }

        return $p;
    }

    /** The hidden prizes, one per symbol, in the order Verity numbers them 1 … N. @return list<array<string, mixed>> */
    public function hiddenList(Competition $c): array
    {
        $out = [];
        foreach ($c->huntPrizes()->get() as $h) {
            for ($i = 0; $i < (int) $h->quantity; $i++) {
                $out[] = ['name' => $h->name, 'value_pence' => (int) $h->value_pence, 'meta' => ['type' => $h->type, 'hunt_prize_id' => $h->id]];
            }
        }

        return $out;
    }

    /** Called by Publishing inside its transaction, straight after Verity publishes: before any ticket. */
    public function seal(Competition $c, VerityCompetition $v, User $admin): void
    {
        $symbol = $c->prizes()->where('type', 'hunt_symbol')->firstOrFail();
        Verity::createHunt($v, $symbol->name, $this->hiddenList($c), 'admin:'.$admin->id);
    }

    public function verityHunt(Competition $c): ?Hunt
    {
        return $c->verity_ref ? Verity::hunt($c->verity_ref) : null;
    }

    /** A ticket won a symbol (from Fulfilment). Once per Verity winner. */
    public function found(Winner $w, int $userId): void
    {
        $c = Competition::query()->where('verity_ref', $w->competition->ref)->first();
        if (! $c || ! User::query()->whereKey($userId)->exists()) {
            return;
        }
        $ticket = (int) $w->entry->number;
        $claim = HuntClaim::query()->firstOrCreate(['verity_winner_id' => $w->id], [
            'competition_id' => $c->id, 'user_id' => $userId, 'ticket_number' => $ticket, 'status' => 'found',
            'found_at' => now(), 'deadline_at' => now()->addHours(max(1, (int) $c->hunt_claim_hours)),
        ]);
        if ($claim->wasRecentlyCreated) {
            DB::afterCommit(fn () => $claim->user->notify(new HuntSymbolFound($claim)));
        }
    }

    /**
     * An admin enters the number the player picked: Verity reveals that prize, and it's paid now, once.
     *
     * @return array{name:string, value_pence:int, type:string}
     */
    public function pick(HuntClaim $claim, int $number, string $via, User $admin): array
    {
        if (! in_array($via, ['facebook', 'email'], true)) {
            throw new \DomainException('Say how the player claimed: Facebook or email.');
        }

        return DB::transaction(function () use ($claim, $number, $via, $admin) {
            $claim = HuntClaim::query()->lockForUpdate()->findOrFail($claim->id);
            if ($claim->status !== 'found') {
                throw new \DomainException('This find has already been '.($claim->status === 'picked' ? 'picked' : 'closed: its claim window passed').'.');
            }
            if ($claim->deadline_at->isPast()) {
                throw new \DomainException('This find\'s claim window has passed, so it isn\'t won.');
            }
            $c = $claim->competition;
            $won = Verity::pickHuntNumber($c->verity_ref, $number, (int) $claim->ticket_number, 'claim:'.$claim->id, 'admin:'.$admin->id);
            $type = (string) ($won['meta']['type'] ?? 'cash');
            $reason = 'Mystery Hunt · '.$won['name'];
            if ($won['value_pence'] > 0) {
                $type === 'ticket_credit'
                    ? $this->wallet->credit($claim->user_id, 'bonus', $won['value_pence'], $reason, 'hunt-claim:'.$claim->id, expiresAt: now()->addDays(Settings::bonusExpiryDays()))
                    : $this->wallet->credit($claim->user_id, 'winnings', $won['value_pence'], $reason, 'hunt-claim:'.$claim->id);
            }
            $claim->forceFill([
                'status' => 'picked', 'number' => $number, 'prize_index' => $won['prize'], 'prize_name' => $won['name'], 'prize_type' => $type,
                'prize_value_pence' => $won['value_pence'], 'claimed_via' => $via, 'picked_by' => $admin->id, 'picked_at' => now(),
            ])->save();
            AdminAction::record($admin, 'hunt.picked', $c->id, null, ['claim' => $claim->id, 'number' => $number, 'ticket' => $claim->ticket_number, 'prize' => $won['name']]);
            DB::afterCommit(fn () => $claim->user->notify(new HuntPrizeRevealed($claim)));

            return ['name' => $won['name'], 'value_pence' => $won['value_pence'], 'type' => $type];
        });
    }

    /** Every few minutes: close finds past their deadline, remind once, and publish the map of finished hunts. */
    public function tick(): array
    {
        $expired = HuntClaim::query()->where('status', 'found')->where('deadline_at', '<=', now())->update(['status' => 'expired', 'updated_at' => now()]);
        $reminded = 0;
        foreach (HuntClaim::query()->with('user')->where('status', 'found')->whereNull('reminded_at')->where('deadline_at', '<=', now()->addHours(self::REMIND_HOURS))
            ->where('found_at', '<=', now()->subHours(self::REMIND_HOURS))->get() as $claim) {
            $claim->forceFill(['reminded_at' => now()])->save();
            $claim->user->notify(new HuntReminder($claim));
            $reminded++;
        }
        $revealed = 0;
        foreach (Competition::query()->published()->whereNotNull('hunt_theme_id')->where('closes_at', '<=', now())->get() as $c) {
            $hunt = $this->verityHunt($c);
            if (! $hunt || $hunt->revealed_at !== null) {
                continue;
            }
            // Postal envelopes received before the close can still be logged for a while: wait one claim window.
            if ($c->closes_at->copy()->addHours(max(1, (int) $c->hunt_claim_hours))->isFuture()
                || HuntClaim::query()->where('competition_id', $c->id)->where('status', 'found')->exists()) {
                continue;
            }
            try {
                Verity::revealHunt($c->verity_ref);
                $revealed++;
            } catch (\Throwable $e) {
                Log::warning('Hunt reveal failed', ['competition' => $c->id, 'error' => $e->getMessage()]);
            }
        }

        return ['expired' => $expired, 'reminded' => $reminded, 'revealed' => $revealed];
    }
}
