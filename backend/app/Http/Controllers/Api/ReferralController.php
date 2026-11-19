<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Presenters\CompetitionPresenter;
use App\Models\Competition;
use App\Models\Referral;
use App\Models\Voucher;
use App\Services\Referrals;
use App\Services\Settings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Refer a Friend: the invite banner, the player's referral page, and using free-ticket vouchers. */
class ReferralController extends Controller
{
    /** Who invited you (first name only), for the sign-up page. */
    public function invite(string $code, Referrals $referrals): JsonResponse
    {
        abort_unless(Settings::referralsOn(), 404);
        $u = $referrals->referrerFor($code);
        abort_unless($u !== null, 404);

        return response()->json(['code' => $u->referral_code, 'firstName' => $u->first_name]);
    }

    public function mine(Request $r, Referrals $referrals): JsonResponse
    {
        abort_unless(Settings::referralsOn(), 404);
        $u = $r->user();
        $code = $referrals->codeFor($u);
        $friends = Referral::query()->with('friend:id,first_name,last_name')->where('referrer_id', $u->id)->latest()->limit(50)->get()
            ->map(fn (Referral $x) => ['name' => $x->friend->first_name.' '.mb_substr((string) $x->friend->last_name, 0, 1).'.', 'status' => $x->status,
                'joinedAt' => $x->created_at->toIso8601ZuluString()]);

        return response()->json([
            'code' => $code,
            'link' => rtrim((string) config('app.frontend_url'), '/').'/r/'.$code,
            'stats' => $referrals->stats($u),
            'rewardType' => \App\Models\Setting::get('referral_reward_type') === 'credit' ? 'credit' : 'tickets',
            'rewardTickets' => Settings::bounded('referral_reward_tickets', 1, 1000),
            'rewardCreditPence' => Settings::bounded('referral_reward_credit_pence', 1, 100000),
            'minPurchasePence' => Settings::bounded('referral_min_purchase_pence', 0, 100000),
            'vouchers' => Voucher::query()->with('competition:id,title,slug')->where('user_id', $u->id)->latest()->limit(50)->get()
                ->map(fn (Voucher $v) => ['id' => $v->id, 'tickets' => $v->tickets, 'status' => $v->status, 'expiresAt' => $v->expires_at->toIso8601ZuluString(),
                    'competition' => $v->competition ? ['title' => $v->competition->title, 'slug' => $v->competition->slug] : null]),
            'friends' => $friends,
        ]);
    }

    /** Live draws this voucher can go into: the usual summaries (% sold, never counts). */
    public function draws(Request $r, Voucher $voucher, Referrals $referrals, CompetitionPresenter $present): JsonResponse
    {
        abort_unless(Settings::referralsOn() && $voucher->user_id === $r->user()->id, 404);
        $list = collect($referrals->drawsFor($voucher, $r->user()))->each->load(['prizes', 'bundleTiers'])->map(fn (Competition $c) => $present->summary($c))->values();

        return response()->json(['data' => $list]);
    }

    public function redeem(Request $r, Voucher $voucher, Referrals $referrals): JsonResponse
    {
        abort_unless(Settings::referralsOn() && $voucher->user_id === $r->user()->id, 404);
        $d = $r->validate(['competitionId' => ['required', 'string', 'max:64']]);
        $c = Competition::query()->findOrFail($d['competitionId']);
        $order = $referrals->redeem($voucher, $r->user(), $c);

        return response()->json(['order' => ['number' => $order->number, 'status' => $order->status]], 201);
    }
}
