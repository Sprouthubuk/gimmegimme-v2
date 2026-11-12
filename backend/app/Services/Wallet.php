<?php

namespace App\Services;

use App\Exceptions\RefusedException;
use App\Models\LedgerEntry;
use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The player's wallet: three balances (deposit, bonus, winnings), each the sum of append-only
 * ledger rows. Spending takes deposit, then bonus, then winnings, under a per-player lock.
 * Bonus can pay for at most half of any basket. Only winnings can be withdrawn.
 */
final class Wallet
{
    public const BUCKETS = ['deposit', 'bonus', 'winnings'];

    /** @return array{deposit:int, bonus:int, winnings:int} */
    public function balances(User|int $user): array
    {
        $id = $user instanceof User ? $user->id : $user;
        $rows = LedgerEntry::query()->where('user_id', $id)
            ->selectRaw("bucket, SUM(CASE WHEN direction = 'credit' THEN amount_pence ELSE -amount_pence END) AS total")
            ->groupBy('bucket')->pluck('total', 'bucket');

        return ['deposit' => (int) ($rows['deposit'] ?? 0), 'bonus' => (int) ($rows['bonus'] ?? 0), 'winnings' => (int) ($rows['winnings'] ?? 0)];
    }

    public function total(User|int $user): int
    {
        return array_sum($this->balances($user));
    }

    /** What the wallet could pay towards a basket of $basketPence (bonus capped at half the basket). */
    public function spendable(User $user, int $basketPence): int
    {
        $b = $this->balances($user);

        return min($basketPence, $b['deposit'] + $b['winnings'] + min($b['bonus'], intdiv($basketPence, 2)));
    }

    /**
     * Add money to one balance. $reference makes it happen once: a second call with the same
     * reference returns the first row and adds nothing.
     */
    public function credit(User|int $user, string $bucket, int $pence, string $reason, string $reference, ?string $orderId = null, ?Carbon $expiresAt = null): LedgerEntry
    {
        $this->assertBucket($bucket);
        if ($pence <= 0) {
            throw new \InvalidArgumentException('A credit must be at least 1p.');
        }
        if ($bucket === 'bonus' && $expiresAt === null) {
            throw new \InvalidArgumentException('Bonus credit always has an expiry date.');
        }
        $id = $user instanceof User ? $user->id : $user;

        return DB::transaction(function () use ($id, $bucket, $pence, $reason, $reference, $orderId, $expiresAt) {
            $this->lock($id);
            if ($existing = LedgerEntry::query()->where('reference', $reference)->first()) {
                return $existing;
            }

            return LedgerEntry::query()->create([
                'user_id' => $id, 'bucket' => $bucket, 'direction' => 'credit', 'amount_pence' => $pence,
                'reason' => $reason, 'reference' => $reference, 'order_id' => $orderId, 'expires_at' => $expiresAt,
            ]);
        });
    }

    /**
     * Take the wallet part of an order: all of it or nothing. Writes the split onto the order.
     * Must be called inside the checkout transaction.
     */
    public function spendForOrder(Order $order, int $pence, int $basketPence, string $tag = 'spend'): void
    {
        if ($pence <= 0) {
            return;
        }
        $this->lock($order->user_id);
        $b = $this->balances($order->user_id);
        $fromDeposit = min($b['deposit'], $pence);
        $fromBonus = min($b['bonus'], intdiv($basketPence, 2), $pence - $fromDeposit);
        $fromWinnings = min($b['winnings'], $pence - $fromDeposit - $fromBonus);
        if ($fromDeposit + $fromBonus + $fromWinnings !== $pence) {
            throw new RefusedException("Your wallet doesn't cover this order.", 'not_enough_wallet');
        }
        foreach (['deposit' => $fromDeposit, 'bonus' => $fromBonus, 'winnings' => $fromWinnings] as $bucket => $amount) {
            if ($amount > 0) {
                LedgerEntry::query()->create([
                    'user_id' => $order->user_id, 'bucket' => $bucket, 'direction' => 'debit', 'amount_pence' => $amount,
                    'reason' => 'Tickets · '.$order->number, 'reference' => "order:{$order->id}:{$tag}:{$bucket}", 'order_id' => $order->id,
                ]);
            }
        }
        $order->forceFill([
            'wallet_pence' => $pence, 'paid_deposit_pence' => $fromDeposit, 'paid_bonus_pence' => $fromBonus, 'paid_winnings_pence' => $fromWinnings,
        ])->save();
    }

    /** Give back the wallet part of an order that was never paid, to the balances it came from. Once only. */
    public function releaseOrder(Order $order): void
    {
        if ($order->status === 'paid' || $order->paid_at !== null) {
            throw new \LogicException('A paid order keeps its wallet part.');
        }
        $expiry = now()->addDays(Settings::bonusExpiryDays());
        foreach (['deposit' => $order->paid_deposit_pence, 'bonus' => $order->paid_bonus_pence, 'winnings' => $order->paid_winnings_pence] as $bucket => $amount) {
            if ($amount > 0) {
                $this->credit($order->user_id, $bucket, $amount, 'Returned · '.$order->number, "order:{$order->id}:release:{$bucket}", $order->id,
                    $bucket === 'bonus' ? $expiry : null);
            }
        }
    }

    /** Take winnings for a withdrawal request. */
    public function debitWinnings(User $user, int $pence, string $reason, string $reference): LedgerEntry
    {
        return DB::transaction(function () use ($user, $pence, $reason, $reference) {
            $this->lock($user->id);
            if ($this->balances($user)['winnings'] < $pence) {
                throw new RefusedException('You can only withdraw your winnings balance.', 'not_enough_winnings', 422, ['amountPence' => ['More than your winnings balance.']]);
            }

            return LedgerEntry::query()->create([
                'user_id' => $user->id, 'bucket' => 'winnings', 'direction' => 'debit', 'amount_pence' => $pence,
                'reason' => $reason, 'reference' => $reference,
            ]);
        });
    }

    /**
     * Write off bonus credit past its expiry that hasn't been spent. Spending is first-in-first-out,
     * so what is unspent is the newest credit: expired = balance - credit still in date.
     */
    public function expireBonus(User|int $user): int
    {
        $id = $user instanceof User ? $user->id : $user;

        return DB::transaction(function () use ($id) {
            $this->lock($id);
            $balance = $this->balances($id)['bonus'];
            if ($balance <= 0) {
                return 0;
            }
            $inDate = (int) LedgerEntry::query()->where('user_id', $id)->where('bucket', 'bonus')->where('direction', 'credit')
                ->where('expires_at', '>', now())->sum('amount_pence');
            $expired = max(0, $balance - $inDate);
            if ($expired > 0) {
                LedgerEntry::query()->create([
                    'user_id' => $id, 'bucket' => 'bonus', 'direction' => 'debit', 'amount_pence' => $expired,
                    'reason' => 'Bonus expired', 'reference' => "bonus-expiry:{$id}:".now()->format('YmdHis').':'.bin2hex(random_bytes(3)),
                ]);
            }

            return $expired;
        });
    }

    /** Serialise every money change for one player. */
    public function lock(int $userId): void
    {
        User::query()->whereKey($userId)->lockForUpdate()->value('id');
    }

    private function assertBucket(string $bucket): void
    {
        if (! in_array($bucket, self::BUCKETS, true)) {
            throw new \InvalidArgumentException("Unknown wallet balance {$bucket}.");
        }
    }
}
