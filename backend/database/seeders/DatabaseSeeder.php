<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;

/**
 * `php artisan db:seed` on a real server: loads the legal pages and nothing else. No test accounts are
 * ever made here (the sample competitions and accounts are DemoSeeder, which refuses production).
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        Artisan::call('gimme:legal-pages');
    }
}
