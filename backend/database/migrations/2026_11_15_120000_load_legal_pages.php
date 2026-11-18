<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Artisan;

/**
 * Fills the legal pages with the wording carried over from the old site, on the next deploy. Pages
 * already edited in the admin are left alone (see gimme:legal-pages).
 */
return new class extends Migration
{
    public function up(): void
    {
        Artisan::call('gimme:legal-pages');
    }

    public function down(): void
    {
        // Wording stays: it may have been edited since.
    }
};
