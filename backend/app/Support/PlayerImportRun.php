<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * One upload in Admin → Import Players: its folder on the private disk (storage/app/private/imports/{id}),
 * the two spreadsheets and a status file. Never on the public disk, never served.
 */
final class PlayerImportRun
{
    public const CURRENT = 'player-import:current';

    public function __construct(public readonly string $id)
    {
        if (! preg_match('/^[a-z0-9]{26}$/', $id)) {
            throw new \InvalidArgumentException('Not an import run');
        }
    }

    public static function start(): self
    {
        $run = new self(Str::lower((string) Str::ulid()));
        Storage::disk('local')->makeDirectory($run->path());
        Cache::forever(self::CURRENT, $run->id);

        return $run;
    }

    public static function current(): ?self
    {
        $id = Cache::get(self::CURRENT);

        return is_string($id) && Storage::disk('local')->exists("imports/{$id}") ? new self($id) : null;
    }

    public function path(string $file = ''): string
    {
        return "imports/{$this->id}".($file !== '' ? "/{$file}" : '');
    }

    public function dir(): string
    {
        return Storage::disk('local')->path($this->path());
    }

    public function status(): array
    {
        $raw = Storage::disk('local')->get($this->path('status.json'));

        return $raw ? (json_decode($raw, true) ?: []) : [];
    }

    public function write(array $status): void
    {
        Storage::disk('local')->put($this->path('status.json'), json_encode($status + ['updated' => now()->toIso8601String()]));
    }

    public function has(string $file): bool
    {
        return Storage::disk('local')->exists($this->path($file));
    }

    /** Rows in each spreadsheet (header not counted), for the record. */
    public function counts(): array
    {
        $out = [];
        foreach (['players.csv' => 'players', 'balances.csv' => 'balances'] as $file => $k) {
            if ($this->has($file)) {
                $out[$k] = max(0, count(array_filter(preg_split('/\r\n|\n|\r/', (string) Storage::disk('local')->get($this->path($file))), fn ($l) => trim($l) !== '')) - 1);
            }
        }

        return $out;
    }

    public function deleteSpreadsheets(): void
    {
        Storage::disk('local')->delete([$this->path('players.csv'), $this->path('balances.csv')]);
    }

    public function delete(): void
    {
        Storage::disk('local')->deleteDirectory($this->path());
        if (Cache::get(self::CURRENT) === $this->id) {
            Cache::forget(self::CURRENT);
        }
    }

    /** Uploads left behind are removed after a day (daily housekeeping). */
    public static function removeOld(): int
    {
        $n = 0;
        $disk = Storage::disk('local');
        $dayAgo = now()->subDay()->getTimestamp();
        // Uploaded but never checked: the files themselves.
        foreach ($disk->files('imports/incoming') as $f) {
            if ($disk->lastModified($f) < $dayAgo) {
                $disk->delete($f);
                $n++;
            }
        }
        foreach (array_diff($disk->directories('imports'), ['imports/incoming']) as $d) {
            $files = Storage::disk('local')->allFiles($d);
            $newest = $files ? max(array_map(fn ($f) => Storage::disk('local')->lastModified($f), $files)) : 0;
            if ($newest < $dayAgo) {
                Storage::disk('local')->deleteDirectory($d);
                $n++;
            }
        }

        return $n;
    }
}
