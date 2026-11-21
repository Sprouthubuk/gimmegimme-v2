<?php

namespace App\Console\Commands;

use App\Models\ArchiveCompetition;
use App\Models\ArchiveEntry;
use App\Models\ArchiveWinner;
use App\Models\Setting;
use App\Support\PictureSizes;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

/**
 * Loads the old (Lovable) site's public record into the archive tables: its competitions, draw winners,
 * instant winners and entry lists, from the four CSVs in resources/archive (exported with the queries in
 * docs/old-site-archive.md). Only what the old site already showed publicly: masked names ("Jo B."), never
 * a full name, email or address; a name that doesn't look masked stops the import. The old pictures are
 * copied to the public disk. Safe to run again: the deploy runs it and it does nothing unless the files
 * changed (or --force). Everything is written in one transaction, so a failed run leaves the old archive.
 */
class ImportArchive extends Command
{
    protected $signature = 'gimme:import-archive {folder? : Folder holding the four CSVs (default resources/archive)} {--dry-run : Check the files and write nothing} {--force : Import even if these files were imported already}';

    protected $description = 'Load the old site\'s competitions, winners and entry lists into the archive';

    public const FILES = ['competitions', 'draw_winners', 'instant_winners', 'entry_lists'];

    public const HASH_SETTING = 'archive_import_hash';

    /** A masked name as the old site showed it: one word, or a first name and an initial ("Jo B."). */
    public const MASKED = '/^[^\s]{1,40}( \p{L}\.)?$/u';

    public function handle(): int
    {
        $dir = rtrim($this->argument('folder') ?: resource_path('archive'), '/');
        $paths = [];
        foreach (self::FILES as $f) {
            if (! is_file($p = "{$dir}/{$f}.csv")) {
                if (! $this->argument('folder') && $f === 'competitions') {
                    $this->info('No archive files to import.');

                    return self::SUCCESS;
                }
                $this->error("Missing {$f}.csv in {$dir}.");

                return self::FAILURE;
            }
            $paths[$f] = $p;
        }
        $hash = hash('sha256', implode('', array_map(fn ($p) => hash_file('sha256', $p), $paths)));
        if (! $this->option('force') && ! $this->option('dry-run') && Setting::get(self::HASH_SETTING) === $hash) {
            $this->info('The archive is already up to date.');

            return self::SUCCESS;
        }

        [$data, $problems] = $this->read($paths);
        if ($problems) {
            foreach (array_slice($problems, 0, 30) as $p) {
                $this->error($p);
            }
            $this->error(count($problems).' problem(s): nothing imported.');

            return self::FAILURE;
        }
        $this->line(sprintf('%d competitions, %d draw winners, %d instant winners, %d entries.',
            count($data['competitions']), count($data['main']), count($data['instant']), count($data['entries'])));
        if ($this->option('dry-run')) {
            $this->info('Dry run: the files are fine. Nothing was written.');

            return self::SUCCESS;
        }

        $images = [];
        foreach ($data['competitions'] as $c) {
            $images[$c['legacy_id']] = $this->copyPicture($c['slug'], $c['image_url']);
        }

        DB::transaction(function () use ($data, $images) {
            $ids = [];
            foreach ($data['competitions'] as $c) {
                $row = ArchiveCompetition::query()->updateOrCreate(['legacy_id' => $c['legacy_id']], [
                    'slug' => $c['slug'], 'title' => $c['title'], 'kind' => $c['kind'], 'image' => $images[$c['legacy_id']],
                    'price_pence' => $c['price_pence'], 'drawn_at' => $c['drawn_at'],
                ]);
                $ids[$c['slug']] = $row->id;
            }
            ArchiveCompetition::query()->whereNotIn('id', array_values($ids))->delete();
            foreach (['main' => 'main', 'instant' => 'instant'] as $key => $kind) {
                foreach (array_chunk($data[$key], 500) as $chunk) {
                    ArchiveWinner::query()->upsert(array_map(fn ($w) => [
                        'archive_competition_id' => $ids[$w['slug']], 'legacy_id' => $w['legacy_id'], 'kind' => $kind, 'name' => $w['name'],
                        'town' => $w['town'], 'prize_name' => $w['prize_name'], 'value_pence' => $w['value_pence'],
                        'ticket_number' => $w['ticket'], 'won_at' => $w['won_at'],
                    ], $chunk), ['legacy_id'], ['archive_competition_id', 'kind', 'name', 'town', 'prize_name', 'value_pence', 'ticket_number', 'won_at']);
                }
            }
            ArchiveWinner::query()->whereNotIn('legacy_id', array_merge(array_column($data['main'], 'legacy_id'), array_column($data['instant'], 'legacy_id')))->delete();
            ArchiveEntry::query()->delete();
            foreach (array_chunk($data['entries'], 1000) as $chunk) {
                ArchiveEntry::query()->insert(array_map(fn ($e) => [
                    'archive_competition_id' => $ids[$e['slug']], 'ticket_number' => $e['ticket'], 'name' => $e['name'], 'source' => $e['source'],
                ], $chunk));
            }
        });
        Setting::put(self::HASH_SETTING, $hash);
        $this->info('Archive imported.');

        return self::SUCCESS;
    }

    /** @return array{0: array<string, list<array<string, mixed>>>, 1: list<string>} */
    private function read(array $paths): array
    {
        $problems = [];
        $out = ['competitions' => [], 'main' => [], 'instant' => [], 'entries' => []];
        $need = [
            'competitions' => ['id', 'slug', 'title', 'image_url', 'ticket_price', 'draw_date'],
            'draw_winners' => ['id', 'competition_slug', 'display_name', 'public_town', 'prize_description', 'prize_value', 'won_at', 'announced', 'winning_ticket_number'],
            'instant_winners' => ['id', 'competition_slug', 'winner_display_name', 'prize_name', 'prize_value', 'winning_ticket_number', 'won_at'],
            'entry_lists' => ['competition_slug', 'ticket_number', 'entry_type', 'display_name'],
        ];
        $rows = [];
        foreach ($paths as $f => $p) {
            $rows[$f] = $this->csv($p);
            $missing = array_diff($need[$f], array_keys($rows[$f][0] ?? []));
            if ($rows[$f] && $missing) {
                $problems[] = "{$f}.csv is missing the column(s): ".implode(', ', $missing).'.';
            }
        }
        if ($problems) {
            return [$out, $problems];
        }
        $masked = function (string $name, string $where) use (&$problems): string {
            $n = trim(preg_replace('/\s+/u', ' ', $name));
            if ($n === '' || mb_strlen($n) > 60 || ! preg_match(self::MASKED, $n)) {
                $problems[] = "{$where}: the name doesn't look masked, so it isn't published.";
            }

            // "Jo b." → "Jo B." (the old instant-win feed didn't capitalise the initial)
            return preg_replace_callback('/ (\p{Ll})\.$/u', fn ($m) => ' '.mb_strtoupper($m[1]).'.', $n);
        };
        $mainBySlug = $instantBySlug = [];
        foreach ($rows['draw_winners'] as $i => $r) {
            if (! in_array(strtolower(trim($r['announced'])), ['true', 't', '1', 'yes'], true)) {
                continue; // never announced on the old site: not public
            }
            $at = 'draw_winners.csv line '.($i + 2);
            $out['main'][] = ['legacy_id' => 'main:'.$r['id'], 'slug' => $r['competition_slug'], 'name' => $masked($r['display_name'], $at),
                'town' => mb_substr(trim($r['public_town']), 0, 80) ?: null, 'prize_name' => self::title($r['prize_description']),
                'value_pence' => self::pence($r['prize_value']), 'ticket' => self::int($r['winning_ticket_number']), 'won_at' => self::time($r['won_at'])];
            $mainBySlug[$r['competition_slug']] = true;
        }
        foreach ($rows['instant_winners'] as $i => $r) {
            $at = 'instant_winners.csv line '.($i + 2);
            $out['instant'][] = ['legacy_id' => 'instant:'.$r['id'], 'slug' => $r['competition_slug'], 'name' => $masked($r['winner_display_name'], $at),
                'town' => null, 'prize_name' => self::title($r['prize_name']), 'value_pence' => self::pence($r['prize_value']),
                'ticket' => self::int($r['winning_ticket_number']), 'won_at' => self::time($r['won_at'])];
            $instantBySlug[$r['competition_slug']] = true;
        }
        $slugs = [];
        foreach ($rows['competitions'] as $i => $r) {
            $slug = trim($r['slug']);
            if ($slug === '' || ! preg_match('/^[a-z0-9-]{1,180}$/', $slug) || isset($slugs[$slug])) {
                $problems[] = 'competitions.csv line '.($i + 2).': missing, odd or repeated web address.';

                continue;
            }
            $slugs[$slug] = true;
            $title = self::title($r['title']);
            $kind = isset($mainBySlug[$slug]) ? 'draw' : (isset($instantBySlug[$slug]) || stripos($title, 'instant') !== false ? 'instant' : 'draw');
            $out['competitions'][] = ['legacy_id' => trim($r['id']), 'slug' => $slug, 'title' => $title, 'kind' => $kind,
                'image_url' => trim($r['image_url']), 'price_pence' => self::pence($r['ticket_price']), 'drawn_at' => self::time($r['draw_date'])];
        }
        foreach (['main', 'instant'] as $k) {
            foreach ($out[$k] as $w) {
                if (! isset($slugs[$w['slug']])) {
                    $problems[] = "A winner belongs to {$w['slug']}, which isn't in competitions.csv.";
                }
            }
        }
        $seen = [];
        foreach ($rows['entry_lists'] as $i => $r) {
            $at = 'entry_lists.csv line '.($i + 2);
            $slug = $r['competition_slug'];
            $ticket = self::int($r['ticket_number']);
            if (! isset($slugs[$slug]) || ! $ticket) {
                $problems[] = "{$at}: unknown competition or ticket number.";

                continue;
            }
            if (isset($seen[$slug][$ticket])) {
                $problems[] = "{$at}: ticket {$ticket} appears twice.";
            }
            $seen[$slug][$ticket] = true;
            $out['entries'][] = ['slug' => $slug, 'ticket' => $ticket, 'name' => $masked($r['display_name'], $at),
                'source' => trim($r['entry_type']) === 'postal' ? 'postal' : 'paid'];
        }

        return [$out, array_values(array_unique($problems))];
    }

    /** @return list<array<string, string>> */
    private function csv(string $path): array
    {
        $f = fopen($path, 'r');
        $head = fgetcsv($f, escape: '');
        if (! $head) {
            return [];
        }
        $head = array_map(fn ($h) => trim(preg_replace('/^\xEF\xBB\xBF/', '', (string) $h)), $head);
        $rows = [];
        while (($r = fgetcsv($f, escape: '')) !== false) {
            if ($r === [null] || $r === ['']) {
                continue;
            }
            $rows[] = array_combine($head, array_pad(array_slice($r, 0, count($head)), count($head), ''));
        }
        fclose($f);

        return $rows;
    }

    /** Copy an old picture to the public disk (archive/{slug}.{ext}); keeps the old address if it can't. */
    private function copyPicture(string $slug, string $url): ?string
    {
        if ($url === '' || ! str_starts_with($url, 'https://')) {
            return null;
        }
        $disk = Storage::disk('public');
        foreach (['png', 'jpg', 'webp'] as $ext) {
            if ($disk->exists($p = "archive/{$slug}.{$ext}")) {
                return $p;
            }
        }
        try {
            $res = Http::timeout(20)->get($url);
            $type = (string) $res->header('Content-Type');
            $ext = match (true) { str_contains($type, 'png') => 'png', str_contains($type, 'webp') => 'webp', str_contains($type, 'jpeg') => 'jpg', default => null };
            if ($res->successful() && $ext && strlen($res->body()) > 0 && strlen($res->body()) < 15_000_000) {
                $disk->put($p = "archive/{$slug}.{$ext}", $res->body());
                PictureSizes::make($p);

                return $p;
            }
        } catch (\Throwable) {
            // fall through: the old address still works while the old site's storage does
        }
        $this->warn("Couldn't copy the picture for {$slug}; using its old address.");

        return $url;
    }

    /** The old titles were in capitals with emoji: keep the words, drop the emoji and spare spaces. */
    public static function title(string $s): string
    {
        $s = preg_replace('/[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}\x{200D}\x{20E3}]/u', '', $s);

        $s = preg_replace(['/\s+/u', '/^[\s\-–—]+|[\s\-–—]+$/u'], [' ', ''], $s);
        // Title Case like the rest of the site, keeping short codes that are written in capitals.
        if ($s === mb_strtoupper($s)) {
            $s = mb_convert_case(mb_strtolower($s), MB_CASE_TITLE);
            $s = preg_replace_callback('/\b(Gta|Ps\d|Xbox|Ghd|Ipad|Uk|Tv|Vip|Led)\b/u', fn ($m) => match ($m[1]) {
                'Xbox' => 'Xbox', 'Ipad' => 'iPad', default => mb_strtoupper($m[1]),
            }, $s);
            $s = preg_replace(['/(\d)-In-(\d)/u', "/'S\b/u"], ['$1-in-$2', "'s"], $s);
        }

        return mb_substr($s, 0, 190);
    }

    private static function pence(string $v): int
    {
        return max(0, (int) round(((float) str_replace([',', '£'], '', $v)) * 100));
    }

    private static function int(string $v): ?int
    {
        return ctype_digit(trim($v)) && (int) $v > 0 ? (int) $v : null;
    }

    private static function time(string $v): ?string
    {
        try {
            return trim($v) === '' ? null : \Carbon\CarbonImmutable::parse($v)->utc()->format('Y-m-d H:i:s');
        } catch (\Throwable) {
            return null;
        }
    }
}
