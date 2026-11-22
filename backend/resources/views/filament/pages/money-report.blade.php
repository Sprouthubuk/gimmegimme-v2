@php
    $o = $this->owed();
    $cols = ['orders' => 'Ticket orders', 'cardIn' => 'Card in', 'walletSpend' => 'Tickets from wallets', 'winningsCredited' => 'Winnings credited', 'withdrawalsPaid' => 'Withdrawals paid'];
@endphp
<x-filament-panels::page>
    <style>
        .gg-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
        .gg-stat .l{font-size:12px;opacity:.6}.gg-stat .v{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}.gg-stat .h{font-size:12px;opacity:.6}
        .gg-tbl{width:100%;font-size:14px;border-collapse:collapse}.gg-tbl th{text-align:right;opacity:.6;font-weight:600;padding:6px 0 6px 12px}
        .gg-tbl th:first-child,.gg-tbl td:first-child{text-align:left;padding-left:0}.gg-tbl td{text-align:right;border-top:1px solid rgba(127,127,127,.2);padding:6px 0 6px 12px;font-variant-numeric:tabular-nums}
        .gg-wrap{overflow-x:auto}
    </style>

    <x-filament::section heading="Held By Players Now" description="Winnings can be withdrawn, so they're what you owe. Deposit and bonus can only be spent on tickets.">
        <div class="gg-stats">
            <div class="gg-stat"><div class="l">Winnings (owed)</div><div class="v">{{ $this->money($o['winnings']) }}</div><div class="h">{{ number_format($o['playersWithWinnings']) }} players hold winnings</div></div>
            <div class="gg-stat"><div class="l">Withdrawals waiting</div><div class="v">{{ $this->money($o['withdrawalsWaiting']) }}</div><div class="h">Already taken from winnings</div></div>
            <div class="gg-stat"><div class="l">Deposit balances</div><div class="v">{{ $this->money($o['deposit']) }}</div></div>
            <div class="gg-stat"><div class="l">Bonus balances</div><div class="v">{{ $this->money($o['bonus']) }}</div><div class="h">Expires; pays up to half a basket</div></div>
        </div>
    </x-filament::section>

    @foreach (['Last '.\App\Filament\Pages\MoneyReport::DAYS.' Days' => $this->daily(), 'Last '.\App\Filament\Pages\MoneyReport::WEEKS.' Weeks (Monday to Sunday)' => $this->weekly()] as $heading => $rows)
        <x-filament::section :heading="$heading" description="Card in is real money: ticket orders paid by card and wallet top ups. Winnings credited are cash and credit prizes paid to wallets.">
            <div class="gg-wrap"><table class="gg-tbl">
                <thead><tr><th>{{ str_contains($heading, 'Weeks') ? 'Week of' : 'Day' }}</th>@foreach ($cols as $label)<th>{{ $label }}</th>@endforeach<th>Card in − withdrawals</th></tr></thead>
                <tbody>
                @foreach ($rows as $d => $r)
                    <tr>
                        <td>{{ $this->dayLabel($d) }}</td>
                        <td>{{ number_format($r['orders']) }}</td>
                        <td>{{ $this->money($r['cardIn']) }}</td>
                        <td>{{ $this->money($r['walletSpend']) }}</td>
                        <td>{{ $this->money($r['winningsCredited']) }}</td>
                        <td>{{ $this->money($r['withdrawalsPaid']) }}</td>
                        <td>{{ $this->money($r['cardIn'] - $r['withdrawalsPaid']) }}</td>
                    </tr>
                @endforeach
                </tbody>
            </table></div>
        </x-filament::section>
    @endforeach
</x-filament-panels::page>
