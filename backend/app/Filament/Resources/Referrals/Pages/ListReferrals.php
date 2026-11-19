<?php

namespace App\Filament\Resources\Referrals\Pages;

use App\Filament\Resources\Referrals\ReferralResource;
use App\Models\Referral;
use App\Models\Voucher;
use App\Services\Settings;
use Filament\Resources\Pages\ListRecords;

class ListReferrals extends ListRecords
{
    protected static string $resource = ReferralResource::class;

    /** The referral report, above the list: totals by status and what the vouchers did. */
    public function getSubheading(): ?string
    {
        $by = Referral::query()->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');
        $v = Voucher::query()->selectRaw('status, count(*) as n, sum(tickets) as t')->groupBy('status')->get()->keyBy('status');
        $line = fn (string $s) => (int) ($by[$s] ?? 0);

        return 'Refer a Friend is '.(Settings::referralsOn() ? 'ON' : 'OFF').' · Friends joined '.number_format($by->sum())
            .' · Rewarded '.number_format($line('rewarded') + $line('capped')).' · Needs review '.$line('review').' · Blocked '.$line('blocked')
            .' · Did not qualify '.$line('missed').' · Vouchers: '.number_format((int) ($v['available']->n ?? 0)).' unused, '
            .number_format((int) ($v['redeemed']->n ?? 0)).' used ('.number_format((int) ($v['redeemed']->t ?? 0)).' tickets), '
            .number_format((int) ($v['expired']->n ?? 0)).' expired, '.number_format((int) ($v['clawed_back']->n ?? 0)).' taken back';
    }
}
