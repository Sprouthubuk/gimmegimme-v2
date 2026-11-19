@php($t = $this->totals())
@php($rows = $this->draws())
<x-filament-panels::page>
    <p style="opacity:.75;margin:0">Gimme Box is <b>{{ $t['on'] ? 'ON' : 'OFF' }}</b> (Settings → Gimme Box). Paid orders only for tickets and bonus.</p>
    <x-filament::section heading="Boxes">
        <div style="display:flex;flex-wrap:wrap;gap:28px">
            @foreach ([['Shaken', number_format($t['built'])], ['Added to basket', number_format($t['added']).' ('.$t['addRate'].')'], ['Paid for', number_format($t['paid']).' ('.$t['payRate'].' of added)'], ['Average paid box', $t['avgValue']], ['Bonus tickets given', number_format($t['bonus'])]] as [$label, $value])
                <div><div style="opacity:.6;font-size:12px">{{ $label }}</div><div style="font-size:22px;font-weight:700">{{ $value }}</div></div>
            @endforeach
        </div>
        @if ($t['byMode'])
            <p style="opacity:.75;margin:12px 0 0">By style: @foreach ($t['byMode'] as $mode => $n){{ ['surprise' => 'Surprise Me', 'big' => 'Biggest Prizes', 'most' => 'Most Tickets'][$mode] ?? $mode }} {{ number_format($n) }}@if (! $loop->last) · @endif @endforeach</p>
        @endif
    </x-filament::section>
    <x-filament::section heading="By draw">
        @if (! $rows)
            No paid Gimme Box tickets yet.
        @else
            <table style="width:100%;font-size:14px;border-collapse:collapse">
                <thead><tr style="text-align:left;opacity:.6"><th style="padding:6px 0">Draw</th><th>Box tickets</th><th>Of which bonus</th><th>All tickets sold</th><th>Share from boxes</th></tr></thead>
                <tbody>
                    @foreach ($rows as $r)
                        <tr style="border-top:1px solid rgba(127,127,127,.2)"><td style="padding:6px 0">{{ $r['title'] }}</td><td>{{ number_format($r['boxTickets']) }}</td><td>{{ number_format($r['bonus']) }}</td><td>{{ number_format($r['sold']) }}</td><td style="{{ $r['warn'] ? 'color:#dc2626;font-weight:700' : '' }}">{{ $r['share'] }}{{ $r['warn'] ? ' ⚠ above the setting' : '' }}</td></tr>
                    @endforeach
                </tbody>
            </table>
        @endif
    </x-filament::section>
</x-filament-panels::page>
