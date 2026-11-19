<?php

namespace App\Console\Commands;

use App\Models\Page;
use Illuminate\Console\Command;

/**
 * Loads the legal wording (resources/legal/*.html, version 2.0 of 18 Nov 2026) into the Pages the
 * site shows at /legal/{slug}. It only fills a page that is missing or still has the sample wording,
 * so wording edited in the admin is never overwritten (unless --force).
 * Run on the server once: php artisan gimme:legal-pages
 */
class LegalPages extends Command
{
    protected $signature = 'gimme:legal-pages {--force : Replace wording already edited in the admin}';

    protected $description = 'Load the legal pages carried over from the old site';

    public const PAGES = [
        'terms' => ['Terms & Conditions', '2.1'],
        'free-entry' => ['Free Entry Terms', '2.0'],
        'privacy' => ['Privacy Policy', '2.1'],
        'cookies' => ['Cookie Policy', '2.0'],
        'complaints' => ['Complaints', '2.0'],
    ];

    public function handle(): int
    {
        foreach (self::PAGES as $slug => [$title, $version]) {
            $html = file_get_contents(resource_path("legal/{$slug}.html"));
            $page = Page::query()->find($slug);
            if ($page && $page->version !== 'sample' && ! $this->option('force')) {
                $this->line("{$slug}: kept (already edited in the admin)");

                continue;
            }
            $page ??= new Page(['slug' => $slug]);
            $page->fill(['title' => $title, 'version' => $version, 'html' => $html])->save();
            $this->info("{$slug}: loaded");
        }

        return self::SUCCESS;
    }
}
