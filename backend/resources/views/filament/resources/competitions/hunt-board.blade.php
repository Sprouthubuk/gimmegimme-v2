<x-filament-panels::page>
    @php($b = $this->board())
    <x-filament::section>
        <div style="display:flex;flex-wrap:wrap;gap:16px;font-weight:600;margin-bottom:12px">
            <span>{{ $b['found'] }} found</span><span>{{ $b['open'] }} waiting for a number</span>
            <span>{{ count($b['taken']) }} picked</span><span>{{ $b['notWon'] }} not claimed in time</span>
            <span>{{ $b['revealed'] ? 'Map revealed' : 'Map sealed by Verity' }}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px">
            @for ($n = 1; $n <= $b['size']; $n++)
                @php($t = $b['taken'][$n] ?? null)
                <div title="{{ $t ? $t['name'].' · '.$t['prize'] : 'Available' }}"
                     style="border-radius:8px;padding:8px 4px;text-align:center;font-weight:700;{{ $t ? 'background:#16a34a;color:#fff' : 'background:rgba(127,127,127,.12)' }}">
                    {{ $n }}
                    @if ($t)<div style="font-size:10px;font-weight:500;line-height:1.2">{{ $t['name'] }}</div>@endif
                </div>
            @endfor
        </div>
    </x-filament::section>
    {{ $this->table }}
</x-filament-panels::page>
