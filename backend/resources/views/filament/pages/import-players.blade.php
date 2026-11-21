@php($s = $this->status())
@php($run = $this->run())
<x-filament-panels::page>
    <x-filament::section heading="How It Works">
        <ol style="margin:0;padding-left:22px;line-height:1.7;list-style:decimal">
            <li>Close sales on the old site, then ask Lovable to run the two queries in <code>docs/lovable-import.md</code> and download <b>players.csv</b> and <b>balances.csv</b>.</li>
            <li>Upload both here and press <b>Check files</b>. Nothing is changed; any problem row is listed below.</li>
            <li>Take a database backup in Forge, then press <b>Import players</b>. When it finishes, the files are deleted from the server.</li>
        </ol>
        <p style="opacity:.7;margin:10px 0 0">Players keep their passwords and wallet balances. Running it again adds nobody twice and pays no balance twice. Uploaded files are private and are removed after a day at most.</p>
    </x-filament::section>

    <x-filament::section heading="Upload">
        {{ $this->form }}
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:16px">
            {{-- Only the buttons that apply now: Import after a passing check, Delete once something is uploaded. --}}
            @foreach ([$this->checkAction, $this->importAction, $this->removeAction] as $action)
                @if ($action->isVisible())
                    {{ $action }}
                @endif
            @endforeach
        </div>
    </x-filament::section>

    @if ($run)
        <div @if ($this->busy()) wire:poll.2s @endif>
            <x-filament::section :heading="($s['dry'] ?? true) ? 'Check' : 'Import'">
                @php($state = $s['state'] ?? 'queued')
                @if ($state === 'queued')
                    <p style="margin:0">Waiting to start…</p>
                @elseif ($state === 'running')
                    <p style="margin:0">Working… this page updates by itself.</p>
                @elseif ($s['ok'] ?? false)
                    <p style="margin:0;font-weight:700;color:#16a34a">{{ ($s['dry'] ?? true) ? 'The files passed the check. Take a backup, then press Import players.' : 'Import finished and the files were deleted from the server.' }}</p>
                @else
                    <p style="margin:0;font-weight:700;color:#dc2626">{{ ($s['dry'] ?? true) ? 'The check found problems. Fix them in the spreadsheet and upload again.' : 'The import did not finish. Nothing half-done was kept; read the messages below.' }}</p>
                @endif
                @if (($run->counts()['players'] ?? null) !== null)
                    <p style="opacity:.7;margin:8px 0 0">{{ number_format($run->counts()['players']) }} players, {{ number_format($run->counts()['balances'] ?? 0) }} balance rows.</p>
                @endif
                @if (! empty($s['output']))
                    <pre style="margin-top:12px;max-height:420px;overflow:auto;white-space:pre-wrap;font-size:12px;background:rgba(127,127,127,.08);padding:12px;border-radius:8px">{{ $s['output'] }}</pre>
                @endif
            </x-filament::section>
        </div>
    @endif
</x-filament-panels::page>
