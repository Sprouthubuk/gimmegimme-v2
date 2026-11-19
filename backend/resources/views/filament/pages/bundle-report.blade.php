@php($rows = $this->rows())
<x-filament-panels::page>
    <p style="opacity:.75;margin:0">Paid orders only. “Average order” is what the order spent on this competition (card and wallet).</p>
    @if (! $rows)
        <x-filament::section>No paid orders yet.</x-filament::section>
    @endif
    @foreach ($rows as $r)
        <x-filament::section :heading="$r['title']">
            <div style="display:flex;flex-wrap:wrap;gap:24px;margin-bottom:12px">
                <div><div style="opacity:.6;font-size:12px">Orders</div><div style="font-size:22px;font-weight:700">{{ number_format($r['orders']) }}</div></div>
                <div><div style="opacity:.6;font-size:12px">Average order</div><div style="font-size:22px;font-weight:700">{{ $r['aov'] }}</div></div>
                <div><div style="opacity:.6;font-size:12px">Tickets per order</div><div style="font-size:22px;font-weight:700">{{ $r['tickets'] }}</div></div>
            </div>
            <table style="width:100%;font-size:14px;border-collapse:collapse">
                <thead><tr style="text-align:left;opacity:.6"><th style="padding:6px 0">Bought as</th><th>Orders</th><th>Share</th></tr></thead>
                <tbody>
                    @foreach ($r['split'] as $s)
                        <tr style="border-top:1px solid rgba(127,127,127,.2)"><td style="padding:6px 0">{{ $s['label'] }}</td><td>{{ number_format($s['orders']) }}</td><td>{{ $s['share'] }}</td></tr>
                    @endforeach
                </tbody>
            </table>
        </x-filament::section>
    @endforeach
</x-filament-panels::page>
