<x-filament-panels::page>
    @php($runs = $this->runs())
    @if ($runs)
        <x-filament::section heading="Runs (newest first)" collapsible>
            @foreach ($runs as $run)
                <details @if ($loop->first) open @endif style="margin-bottom:12px">
                    <summary style="cursor:pointer;font-weight:600">{{ $run['name'] }}</summary>
                    <pre style="white-space:pre-wrap;font-size:12px;line-height:1.5;margin-top:8px">{{ $run['text'] }}</pre>
                </details>
            @endforeach
        </x-filament::section>
    @endif
    {{ $this->table }}
</x-filament-panels::page>
