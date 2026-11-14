<?php

namespace App\Console\Commands;

use App\Models\Competition;
use App\Support\PictureSizes;
use Illuminate\Console\Command;

/** Make the smaller picture copies for every competition that doesn't have them yet. Safe to run on every deploy. */
class PictureSizesCommand extends Command
{
    protected $signature = 'gimme:picture-sizes {--force : Make them again even if they exist}';

    protected $description = 'Make small WebP copies of competition pictures';

    public function handle(): int
    {
        $made = 0;
        foreach (Competition::query()->whereNotNull('image')->cursor() as $c) {
            if ($this->option('force') || count(PictureSizes::existing($c->image)) < count(PictureSizes::WIDTHS)) {
                $made += PictureSizes::make($c->image) > 0 ? 1 : 0;
            }
        }
        $this->info("Picture copies made for {$made} competition(s).");

        return self::SUCCESS;
    }
}
