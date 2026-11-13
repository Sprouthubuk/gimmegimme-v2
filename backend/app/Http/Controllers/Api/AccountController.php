<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\RefusedException;
use App\Http\Controllers\Controller;
use App\Http\Presenters\AccountPresenter;
use App\Models\OrderLine;
use App\Models\Withdrawal;
use App\Services\Orders;
use App\Services\Settings;
use App\Services\Wallet;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AccountController extends Controller
{
    private function present(): AccountPresenter
    {
        return app(AccountPresenter::class);
    }

    public function me(Request $r): JsonResponse
    {
        return response()->json($this->present()->me($r->user()));
    }

    public function transactions(Request $r): JsonResponse
    {
        return response()->json(['data' => $this->present()->transactions($r->user())]);
    }

    public function tickets(Request $r): JsonResponse
    {
        $tab = in_array($r->query('tab'), ['active', 'to-play', 'won', 'past'], true) ? $r->query('tab') : 'active';

        return response()->json(['data' => $this->present()->ticketGroups($r->user(), $tab, max(1, min(200, (int) $r->query('limit', 100))))]);
    }

    /** Every ticket of one order line, a page at a time (orders can hold thousands). */
    public function ticketPage(Request $r, string $number, string $competition): JsonResponse
    {
        $line = OrderLine::query()->with(['competition', 'order'])->where('competition_id', $competition)->whereNotNull('tickets')
            ->whereHas('order', fn ($q) => $q->where('number', $number)->where('user_id', $r->user()->id)->where('status', 'paid'))->first();
        abort_if(! $line, 404);

        return response()->json($this->present()->ticketPage($line, (int) $r->query('page', 1)));
    }

    public function limits(Request $r): JsonResponse
    {
        return response()->json($this->present()->limits($r->user()));
    }

    /** Lowering a limit is instant; raising or removing it waits 24 hours. */
    public function setLimits(Request $r): JsonResponse
    {
        $d = $r->validate(['weeklyDepositPence' => ['present', 'nullable', 'integer', 'min:500', 'max:10000000']]);
        $u = $r->user();
        $l = $u->limits()->firstOrCreate([]);
        $new = $d['weeklyDepositPence'];
        $current = $l->weekly_deposit_pence;
        if ($current === null ? $new !== null : ($new !== null && $new <= $current)) {
            $l->forceFill(['weekly_deposit_pence' => $new, 'pending_weekly_deposit_pence' => null, 'pending_remove' => false, 'pending_applies_at' => null])->save();
        } elseif ($new !== $current) {
            $l->forceFill(['pending_weekly_deposit_pence' => $new, 'pending_remove' => $new === null, 'pending_applies_at' => now()->addDay()])->save();
        }

        return response()->json($this->present()->limits($u->refresh()));
    }

    /** Take a break: applies at once, no checks in front of it. Can only be lengthened. */
    public function takeBreak(Request $r): JsonResponse
    {
        $d = $r->validate(['days' => ['required', 'integer', 'in:1,7,14,30,42']]);
        $u = $r->user();
        $until = now()->addDays($d['days']);
        if (! $u->cool_off_until || $u->cool_off_until->lt($until)) {
            $u->forceFill(['cool_off_until' => $until])->save();
        }

        return response()->json($this->present()->limits($u->refresh()));
    }

    /** Self-exclusion: applies at once, can't be shortened. */
    public function selfExclude(Request $r): JsonResponse
    {
        $d = $r->validate(['months' => ['required', 'integer', 'in:6,12,24,60']]);
        $u = $r->user();
        $until = now()->addMonths($d['months']);
        if (! $u->self_excluded_until || $u->self_excluded_until->lt($until)) {
            $u->forceFill(['self_excluded_until' => $until, 'marketing_email' => false, 'marketing_sms' => false])->save();
        }

        return response()->json($this->present()->limits($u->refresh()));
    }

    public function profile(Request $r): JsonResponse
    {
        $d = $r->validate(['phone' => ['present', 'nullable', 'string', 'max:20', 'regex:/^[0-9 +()-]{7,20}$/']]);
        $r->user()->forceFill(['phone' => $d['phone'] ? trim($d['phone']) : null])->save();

        return response()->json($this->present()->me($r->user()));
    }

    /** The address is filled once; after that only we change it. */
    public function address(Request $r): JsonResponse
    {
        $u = $r->user();
        if ($u->address_line1) {
            throw new RefusedException('Contact us to change your address.', 'fill_once');
        }
        $d = $r->validate([
            'line1' => ['required', 'string', 'max:120'], 'line2' => ['nullable', 'string', 'max:120'],
            'city' => ['required', 'string', 'max:80'], 'postcode' => ['required', 'string', 'regex:/^[A-Za-z]{1,2}[0-9][A-Za-z0-9]?\s*[0-9][A-Za-z]{2}$/'],
        ], ['postcode.regex' => 'Enter a UK postcode.']);
        $pc = strtoupper(preg_replace('/\s+/', '', $d['postcode']));
        $u->forceFill(['address_line1' => trim($d['line1']), 'address_line2' => ($d['line2'] ?? null) ? trim($d['line2']) : null, 'city' => trim($d['city']),
            'postcode' => substr($pc, 0, -3).' '.substr($pc, -3)])->save();

        return response()->json($this->present()->me($u));
    }

    public function preferences(Request $r): JsonResponse
    {
        $d = $r->validate(['email' => ['required', 'boolean'], 'sms' => ['required', 'boolean'], 'winNotifications' => ['required', 'boolean']]);
        $u = $r->user();
        $excluded = $u->self_excluded_until?->isFuture();
        $u->forceFill(['marketing_email' => $d['email'] && ! $excluded, 'marketing_sms' => $d['sms'] && ! $excluded, 'win_notifications' => $d['winNotifications']])->save();

        return response()->json($this->present()->me($u));
    }

    public function deposit(Request $r, Orders $orders): JsonResponse
    {
        $d = $r->validate(['amountPence' => ['required', 'integer', 'min:1']]);
        $o = $orders->deposit($r->user(), $d['amountPence']);

        return response()->json(['redirectUrl' => $o->gateway_url, 'orderNumber' => $o->number], 201);
    }

    /** Winnings only, from the minimum, ID checked first; paid by hand by an admin. */
    public function withdraw(Request $r, Wallet $wallet): JsonResponse
    {
        $d = $r->validate(['amountPence' => ['required', 'integer', 'min:1']]);
        $u = $r->user();
        if ($d['amountPence'] < Settings::minWithdrawal()) {
            throw new RefusedException('You can withdraw winnings from £'.number_format(Settings::minWithdrawal() / 100, 2).'.', 'withdrawal_minimum', 422, ['amountPence' => ['Below the minimum withdrawal.']]);
        }
        if (! $u->id_verified_at) {
            throw new RefusedException('We need to check your ID before your first withdrawal. Contact us and we’ll walk you through it.', 'id_required', 403);
        }
        if ($u->on_hold_at || $u->closed_at) {
            throw new RefusedException('Your account is on hold. Please contact us.', 'on_hold', 403);
        }
        DB::transaction(function () use ($u, $d, $wallet) {
            $w = Withdrawal::query()->create(['user_id' => $u->id, 'amount_pence' => $d['amountPence']]);
            $wallet->debitWinnings($u, $d['amountPence'], 'Withdrawal requested', 'withdrawal:'.$w->id);
        });

        return response()->json(null, 201);
    }
}
