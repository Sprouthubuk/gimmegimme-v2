@php
    use App\Filament\Support\Money;
    $u = $this->record;
    $m = $this->money();
    $uk = fn ($t, $f = 'j M Y, H:i') => $t ? \Illuminate\Support\Carbon::parse($t)->setTimezone('Europe/London')->format($f) : '—';
    $entries = $this->entries();
    $wins = $this->wins();
    $orders = $this->orders();
    $ledger = $this->ledger();
    $withdrawals = $this->withdrawals();
    $log = $this->adminLog();
    $limit = $u->limits;
    $flags = array_filter([
        $u->is_admin ? 'Admin' : null, $u->is_staff ? 'Staff (can’t play)' : null, $u->on_hold_at ? 'On hold' : null, $u->closed_at ? 'Closed' : null,
        $u->self_excluded_until && $u->self_excluded_until->isFuture() ? 'Self-excluded until '.$uk($u->self_excluded_until, 'j M Y') : null,
        $u->cool_off_until && $u->cool_off_until->isFuture() ? 'On a break until '.$uk($u->cool_off_until) : null,
    ]);
    $stat = fn ($label, $value, $hint = null) => ['label' => $label, 'value' => $value, 'hint' => $hint];
@endphp
<x-filament-panels::page>
    <style>
        .gg-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
        .gg-stat .l{font-size:12px;opacity:.6}.gg-stat .v{font-size:22px;font-weight:700}.gg-stat .h{font-size:12px;opacity:.6}
        .gg-tbl{width:100%;font-size:14px;border-collapse:collapse}.gg-tbl th{text-align:left;opacity:.6;font-weight:600;padding:6px 8px 6px 0}
        .gg-tbl td{border-top:1px solid rgba(127,127,127,.2);padding:6px 8px 6px 0;vertical-align:top}.gg-wrap{overflow-x:auto}
        .gg-muted{opacity:.6;font-size:12px}.gg-pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;background:rgba(127,127,127,.18);margin:0 4px 4px 0}
        .gg-num{font-variant-numeric:tabular-nums}
    </style>

    <x-filament::section heading="Player">
        <div class="gg-stats">
            <div class="gg-stat"><div class="l">Email</div><div style="font-weight:600;word-break:break-all">{{ $u->email }}</div><div class="h">{{ $u->email_verified_at ? 'Confirmed' : 'Not confirmed' }}</div></div>
            <div class="gg-stat"><div class="l">Joined</div><div style="font-weight:600">{{ $uk($u->created_at, 'j M Y') }}</div><div class="h">{{ $u->legacy_id ? 'Moved from the old site' : 'New site' }}</div></div>
            <div class="gg-stat"><div class="l">Date of birth</div><div style="font-weight:600">{{ $u->date_of_birth ? $u->date_of_birth->format('j M Y').' ('.$u->date_of_birth->age.')' : '—' }}</div></div>
            <div class="gg-stat"><div class="l">ID check</div><div style="font-weight:600">{{ $u->id_verified_at ? 'Checked '.$uk($u->id_verified_at, 'j M Y') : 'Not checked' }}</div></div>
            <div class="gg-stat"><div class="l">Phone</div><div style="font-weight:600">{{ $u->phone ?: '—' }}</div></div>
            <div class="gg-stat"><div class="l">Town</div><div style="font-weight:600">{{ $u->city ?: '—' }}{{ $u->postcode ? ' · '.$u->postcode : '' }}</div></div>
        </div>
        @if ($flags)
            <div style="margin-top:10px">@foreach ($flags as $f)<span class="gg-pill">{{ $f }}</span>@endforeach</div>
        @endif
        @if ($u->on_hold_reason)<p class="gg-muted" style="margin-top:6px">Hold reason: {{ $u->on_hold_reason }}</p>@endif
    </x-filament::section>

    <x-filament::section heading="Wallet">
        <div class="gg-stats">
            @foreach ([
                $stat('Winnings (withdrawable)', Money::show($m['winnings']), $m['withdrawalPending'] ? Money::show($m['withdrawalPending']).' withdrawal waiting' : null),
                $stat('Deposit', Money::show($m['deposit'])),
                $stat('Bonus', Money::show($m['bonus']), $m['bonus'] && $m['bonusExpires'] ? 'First expires '.$uk($m['bonusExpires'], 'j M Y') : null),
                $stat('Total balance', Money::show($m['winnings'] + $m['deposit'] + $m['bonus'])),
            ] as $s)
                <div class="gg-stat"><div class="l">{{ $s['label'] }}</div><div class="v gg-num">{{ $s['value'] }}</div>@if ($s['hint'])<div class="h">{{ $s['hint'] }}</div>@endif</div>
            @endforeach
        </div>
    </x-filament::section>

    <x-filament::section heading="Lifetime" description="Real money in is card payments (tickets and top ups). Won is the value of every prize, cash or not.">
        <div class="gg-stats">
            @foreach ([
                $stat('Paid in by card', Money::show($m['toppedUp'] + $m['cardOnTickets']), Money::show($m['toppedUp']).' top ups · '.Money::show($m['cardOnTickets']).' on tickets'),
                $stat('Spent on tickets', Money::show($m['cardOnTickets'] + $m['walletOnTickets']), number_format($m['ticketOrders']).' orders · '.Money::show($m['walletOnTickets']).' from wallet'),
                $stat('Won', Money::show($m['won']), $wins->count().' wins'),
                $stat('Withdrawn', Money::show($m['withdrawn'])),
                $stat('Net (paid in − withdrawn)', Money::show($m['toppedUp'] + $m['cardOnTickets'] - $m['withdrawn'])),
                $stat('Last order', $uk($m['lastOrderAt'], 'j M Y')),
            ] as $s)
                <div class="gg-stat"><div class="l">{{ $s['label'] }}</div><div class="v gg-num">{{ $s['value'] }}</div>@if ($s['hint'])<div class="h">{{ $s['hint'] }}</div>@endif</div>
            @endforeach
        </div>
    </x-filament::section>

    <x-filament::section heading="Safer Play">
        <div class="gg-stats">
            <div class="gg-stat"><div class="l">Paid in, last 24 hours</div><div class="v gg-num">{{ Money::show($m['paidIn24h']) }}</div></div>
            <div class="gg-stat"><div class="l">Last 7 days</div><div class="v gg-num">{{ Money::show($m['paidIn7d']) }}</div></div>
            <div class="gg-stat"><div class="l">Last 30 days</div><div class="v gg-num">{{ Money::show($m['paidIn30d']) }}</div></div>
            <div class="gg-stat"><div class="l">Weekly limit</div><div class="v gg-num">{{ $limit?->weekly_deposit_pence ? Money::show($limit->weekly_deposit_pence) : 'None set' }}</div>
                @if ($limit?->pending_applies_at)<div class="h">Change pending from {{ $uk($limit->pending_applies_at) }}</div>@endif</div>
            <div class="gg-stat"><div class="l">Break / self-exclusion</div><div style="font-weight:600">{{ ($u->cool_off_until && $u->cool_off_until->isFuture()) ? 'Break until '.$uk($u->cool_off_until) : (($u->self_excluded_until && $u->self_excluded_until->isFuture()) ? 'Excluded until '.$uk($u->self_excluded_until, 'j M Y') : 'None') }}</div></div>
        </div>
    </x-filament::section>

    <x-filament::section heading="Competitions Entered" :description="count($entries).' competitions'">
        @if (! $entries)
            <p class="gg-muted">No tickets yet.</p>
        @else
            <div class="gg-wrap"><table class="gg-tbl">
                <thead><tr><th>Competition</th><th>Tickets</th><th>How</th><th>Wins</th><th>Ticket numbers</th></tr></thead>
                <tbody>
                @foreach ($entries as $e)
                    <tr>
                        <td>{{ $e['title'] }}<div class="gg-muted">Last {{ $uk($e['last'], 'j M, H:i') }}</div></td>
                        <td class="gg-num">{{ number_format($e['tickets']) }}</td>
                        <td>{{ $e['sources'] ?: '—' }}</td>
                        <td class="gg-num">{{ $e['won'] ?: '—' }}</td>
                        <td>
                            @if ($e['numbers'])
                                <details><summary style="cursor:pointer">{{ count($e['numbers']) > 12 ? 'Show '.number_format(count($e['numbers'])).' numbers' : implode(', ', $e['numbers']) }}</summary>
                                    @if (count($e['numbers']) > 12)<div class="gg-muted gg-num" style="max-height:160px;overflow:auto">{{ implode(', ', $e['numbers']) }}</div>@endif
                                </details>
                            @else
                                <span class="gg-muted">On the entry list</span>
                            @endif
                        </td>
                    </tr>
                @endforeach
                </tbody>
            </table></div>
        @endif
    </x-filament::section>

    <x-filament::section heading="Wins" :description="$wins->count().' wins · '.Money::show($m['won'])">
        @if ($wins->isEmpty())
            <p class="gg-muted">No wins yet.</p>
        @else
            <div class="gg-wrap"><table class="gg-tbl">
                <thead><tr><th>When</th><th>Prize</th><th>Value</th><th>Competition</th><th>Type</th></tr></thead>
                <tbody>
                @foreach ($wins as $w)
                    <tr>
                        <td>{{ $uk($w->created_at) }}</td>
                        <td>{{ $w->prize_name }}@if ($w->prize_value_pence >= \App\Support\Reports::bigWinPence()) <span class="gg-pill">Big win</span>@endif</td>
                        <td class="gg-num">{{ Money::show((int) $w->prize_value_pence) }}</td>
                        <td>{{ $w->competition }}</td>
                        <td>{{ $w->type === 'instant' ? 'Instant' : 'Draw' }}</td>
                    </tr>
                @endforeach
                </tbody>
            </table></div>
        @endif
    </x-filament::section>

    <x-filament::section heading="Orders" :description="'Latest '.min(\App\Filament\Resources\Users\Pages\ViewUser::ROWS, $this->ordersCount()).' of '.number_format($this->ordersCount())">
        @if ($orders->isEmpty())
            <p class="gg-muted">No orders yet.</p>
        @else
            <div class="gg-wrap"><table class="gg-tbl">
                <thead><tr><th>Order</th><th>When</th><th>What</th><th>Total</th><th>Card</th><th>Wallet</th><th>Status</th></tr></thead>
                <tbody>
                @foreach ($orders as $o)
                    <tr>
                        <td>{{ $o->number }}</td>
                        <td>{{ $uk($o->paid_at ?? $o->created_at) }}</td>
                        <td>
                            @if ($o->order_type === 'deposit')
                                Top up
                            @else
                                @foreach ($o->lines as $l)
                                    <div>{{ number_format($l->quantity) }} × {{ $l->competition?->title ?? 'Competition' }}{{ $l->bundle_label ? ' ('.$l->bundle_label.')' : '' }}</div>
                                @endforeach
                            @endif
                        </td>
                        <td class="gg-num">{{ Money::show((int) $o->total_pence) }}</td>
                        <td class="gg-num">{{ Money::show((int) $o->card_pence) }}</td>
                        <td class="gg-num">{{ Money::show((int) $o->wallet_pence) }}</td>
                        <td>{{ ucfirst(str_replace('_', ' ', $o->status)) }}@if ($o->needs_attention) <span class="gg-pill">Needs attention</span>@endif</td>
                    </tr>
                @endforeach
                </tbody>
            </table></div>
        @endif
    </x-filament::section>

    <x-filament::section heading="Wallet History" :description="'Latest '.min(\App\Filament\Resources\Users\Pages\ViewUser::ROWS, $this->ledgerCount()).' of '.number_format($this->ledgerCount()).' movements'">
        @if ($ledger->isEmpty())
            <p class="gg-muted">No wallet movements yet.</p>
        @else
            <div class="gg-wrap"><table class="gg-tbl">
                <thead><tr><th>When</th><th>What</th><th>Balance</th><th>In</th><th>Out</th></tr></thead>
                <tbody>
                @foreach ($ledger as $e)
                    <tr>
                        <td>{{ $uk($e->created_at) }}</td>
                        <td>{{ $e->reason }}@if ($e->expires_at)<div class="gg-muted">Expires {{ $uk($e->expires_at, 'j M Y') }}</div>@endif</td>
                        <td>{{ ucfirst($e->bucket) }}</td>
                        <td class="gg-num">{{ $e->direction === 'credit' ? Money::show((int) $e->amount_pence) : '' }}</td>
                        <td class="gg-num">{{ $e->direction === 'debit' ? Money::show((int) $e->amount_pence) : '' }}</td>
                    </tr>
                @endforeach
                </tbody>
            </table></div>
        @endif
    </x-filament::section>

    <x-filament::section heading="Withdrawals" collapsible>
        @if ($withdrawals->isEmpty())
            <p class="gg-muted">No withdrawals.</p>
        @else
            <div class="gg-wrap"><table class="gg-tbl">
                <thead><tr><th>Asked</th><th>Amount</th><th>Status</th><th>Decided</th><th>Note</th></tr></thead>
                <tbody>
                @foreach ($withdrawals as $w)
                    <tr><td>{{ $uk($w->created_at) }}</td><td class="gg-num">{{ Money::show((int) $w->amount_pence) }}</td><td>{{ ucfirst($w->status) }}</td><td>{{ $uk($w->decided_at) }}</td><td>{{ $w->note }}</td></tr>
                @endforeach
                </tbody>
            </table></div>
        @endif
    </x-filament::section>

    <x-filament::section heading="Admin History" collapsible collapsed>
        @if ($log->isEmpty())
            <p class="gg-muted">No admin actions on this account.</p>
        @else
            <div class="gg-wrap"><table class="gg-tbl">
                <thead><tr><th>When</th><th>Who</th><th>What</th><th>Reason</th></tr></thead>
                <tbody>
                @foreach ($log as $a)
                    <tr><td>{{ $uk($a->created_at) }}</td><td>{{ $a->admin ? trim($a->admin->first_name.' '.$a->admin->last_name) : '—' }}</td><td>{{ str_replace(['player.', 'wallet.', '_'], ['', 'wallet ', ' '], $a->action) }}</td><td>{{ $a->reason }}</td></tr>
                @endforeach
                </tbody>
            </table></div>
        @endif
    </x-filament::section>
</x-filament-panels::page>
