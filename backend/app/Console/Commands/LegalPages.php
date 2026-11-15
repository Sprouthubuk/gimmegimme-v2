<?php

namespace App\Console\Commands;

use App\Models\Page;
use Illuminate\Console\Command;

/**
 * Loads the legal wording carried over from the old site (resources/legal/*.html) into the Pages the
 * site shows at /legal/{slug}. It only fills a page that is missing or still has the sample wording,
 * so wording edited in the admin is never overwritten (unless --force).
 * Run on the server once: php artisan gimme:legal-pages
 */
class LegalPages extends Command
{
    protected $signature = 'gimme:legal-pages {--force : Replace wording already edited in the admin}';

    protected $description = 'Load the legal pages carried over from the old site';

    public const PAGES = [
        'terms' => ['Terms & Conditions', '1.3'],
        'free-entry' => ['Free Entry Terms', '1'],
        'privacy' => ['Privacy Policy', '1'],
        'cookies' => ['Cookie Policy', '1'],
        'complaints' => ['Complaints', '1'],
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
