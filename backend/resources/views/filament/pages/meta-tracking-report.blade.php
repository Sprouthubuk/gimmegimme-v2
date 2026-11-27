@php($rows = $this->rows())
@php($errors = $this->errors())
@php($setup = $this->setup())
<x-filament-panels::page>
    <x-filament::section heading="How to read this">
        <ul style="margin:0;padding-left:18px;line-height:1.7;opacity:.85">
            <li><b>Sales</b>: paid ticket orders with real money (bonus credit taken off), by the day they were paid (UK time). Free entries and £0 orders are left out, as they are for Meta.</li>
            <li><b>Accepted cookies</b>: buyers who pressed "Accept" in the cookie banner. Only these can be sent to Meta, by the browser and by the server. Everyone else is invisible to Meta by law, so Meta will always show fewer sales than the site.</li>
            <li><b>Sent to Meta</b>: accepted by Meta's Conversions API. The browser sends the same sale with the same id, and Meta counts it once.</li>
            <li><b>Value</b> includes winnings a player spent again (shown separately), so Meta's purchase value is higher than card money in.</li>
            <li>Ads Manager then shows only the sales it can link to an ad (its attribution setting), so its number is lower again.</li>
        </ul>
        <p style="margin:12px 0 0">
            Pixel ID: <b>{{ $setup['pixel'] ? 'set' : 'NOT SET (Settings → Site)' }}</b> ·
            Server access token: <b>{{ $setup['token'] ? 'set' : 'NOT SET (META_CAPI_TOKEN in Forge): the server sends nothing' }}</b>
        </p>
    </x-filament::section>

    <x-filament::section heading="By day">
        <table style="width:100%;font-size:14px;border-collapse:collapse">
            <thead><tr style="text-align:left;opacity:.6">
                <th style="padding:6px 0">Day</th><th>Sales</th><th>Value</th><th>Of which winnings spent</th><th>Card</th>
                <th>Accepted cookies</th><th>Sent to Meta</th><th>Value sent</th><th>Still to send</th><th>Not sent</th>
            </tr></thead>
            <tbody>
                @foreach ($rows as $day => $r)
                    <tr style="border-top:1px solid rgba(127,127,127,.2)">
                        <td style="padding:6px 0">{{ \Illuminate\Support\Carbon::parse($day)->format('D j M') }}</td>
                        <td>{{ number_format($r['orders']) }}</td>
                        <td>{{ $this->money($r['value']) }}</td>
                        <td>{{ $this->money($r['winningsSpent']) }}</td>
                        <td>{{ $this->money($r['card']) }}</td>
                        <td>{{ number_format($r['consented']) }} ({{ $this->pct($r['consented'], $r['orders']) }})</td>
                        <td>{{ number_format($r['sent']) }} ({{ $this->pct($r['sent'], $r['orders']) }})</td>
                        <td>{{ $this->money($r['sentValue']) }}</td>
                        <td>{{ number_format($r['waiting']) }}</td>
                        <td style="{{ $r['notSent'] ? 'color:#dc2626;font-weight:700' : '' }}">{{ number_format($r['notSent']) }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </x-filament::section>

    @if ($errors)
        <x-filament::section heading="Why sends failed (last 7 days)">
            @foreach ($errors as $error => $n)
                <div>{{ $error }} — {{ number_format($n) }}</div>
            @endforeach
        </x-filament::section>
    @endif
</x-filament-panels::page>
