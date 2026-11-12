<?php

namespace App\Services;

use App\Exceptions\RefusedException;
use App\Models\AdminAction;
use App\Models\Competition;
use App\Models\PostalEntry;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Sprouthub\Verity\Engine\VerityException;
use Sprouthub\Verity\Facades\Verity;

/**
 * The free postal route: one envelope, one entry, with the same chance as a paid ticket. The same
 * play check applies, and the per-person limit counts postal and paid entries together (Verity
 * enforces it per owner). Every envelope is recorded, entered or refused.
 */
final class Postal
{
    public function __construct(private PlayCheck $check, private Fulfilment $fulfilment) {}

    public function log(Competition $c, string $email, Carbon $receivedAt, User $admin): PostalEntry
    {
        $user = User::query()->where('email', strtolower(trim($email)))->whereNotNull('email_verified_at')->first();
        $refuse = fn (string $why) => $this->record($c, $user, $receivedAt, $admin, 'refused', $why);

        if (! $c->verity_ref) {
            return $refuse('The competition isn’t published.');
        }
        if ($receivedAt->gt($c->closes_at)) {
            return $refuse('Received after the closing time.');
        }
        if ($receivedAt->isFuture()) {
            return $refuse('The received time is in the future.');
        }
        if (! $user) {
            return $refuse('No account with a confirmed email address matches.');
        }
        try {
            $this->check->assertAllowed($user);
        } catch (RefusedException $e) {
            return $refuse($e->getMessage());
        }

        return DB::transaction(function () use ($c, $user, $receivedAt, $admin, $refuse) {
            try {
                $group = Verity::addPostalEntry($c->verity_ref, $user->ownerRef(), ['ordered_at' => $receivedAt]);
            } catch (VerityException $e) {
                return $refuse($e->getMessage());
            }
            if ($c->isInstant()) {
                $this->fulfilment->playAll($group->reference);
            }

            return $this->record($c, $user, $receivedAt, $admin, 'entered', null, $group->reference);
        });
    }

    private function record(Competition $c, ?User $user, Carbon $at, User $admin, string $status, ?string $reason, ?string $group = null): PostalEntry
    {
        $p = PostalEntry::query()->create([
            'competition_id' => $c->id, 'user_id' => $user?->id, 'received_at' => $at, 'status' => $status,
            'reason' => $reason, 'entry_group_ref' => $group, 'logged_by' => $admin->id,
        ]);
        AdminAction::record($admin, 'postal.'.$status, $c->id, $reason, ['user' => $user?->id]);

        return $p;
    }
}
