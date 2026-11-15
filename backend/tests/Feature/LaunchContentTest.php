<?php

namespace Tests\Feature;

use App\Models\Page;
use App\Models\User;
use Tests\TestCase;

/** What a real server gets from `db:seed` and `gimme:legal-pages`. */
class LaunchContentTest extends TestCase
{
    public function test_legal_pages_load_from_the_old_site_wording_and_show_on_the_api(): void
    {
        Page::query()->delete(); // the migration has already loaded them once
        $this->artisan('gimme:legal-pages')->assertSuccessful();

        foreach (['terms', 'free-entry', 'privacy', 'cookies', 'complaints'] as $slug) {
            $page = Page::query()->findOrFail($slug);
            $this->assertNotSame('sample', $page->version);
            $this->assertStringNotContainsString('placeholder', strtolower($page->html));
            $this->getJson("/api/pages/{$slug}")->assertOk()->assertJsonPath('title', $page->title);
        }
        $terms = Page::query()->findOrFail('terms')->html;
        $this->assertStringContainsString('17496537', $terms);
        $this->assertStringContainsString('<h2 id="1-the-promoter">', $terms);
        $this->assertStringContainsString('57 Oakhanger Drive', Page::query()->findOrFail('free-entry')->html);
    }

    public function test_wording_edited_in_the_admin_is_kept_unless_forced(): void
    {
        Page::query()->delete();
        Page::query()->create(['slug' => 'terms', 'title' => 'Terms & Conditions', 'version' => '2.0', 'html' => '<p>Edited by the owner</p>']);
        Page::query()->create(['slug' => 'privacy', 'title' => 'Privacy Policy', 'version' => 'sample', 'html' => '<p>Sample</p>']);

        $this->artisan('gimme:legal-pages')->assertSuccessful();

        $this->assertSame('<p>Edited by the owner</p>', Page::query()->findOrFail('terms')->html);
        $this->assertStringNotContainsString('Sample', Page::query()->findOrFail('privacy')->html);

        $this->artisan('gimme:legal-pages', ['--force' => true])->assertSuccessful();
        $this->assertStringContainsString('17496537', Page::query()->findOrFail('terms')->html);
    }

    public function test_db_seed_makes_no_accounts(): void
    {
        $this->seed();

        $this->assertSame(0, User::query()->count());
        $this->assertSame(5, Page::query()->count());
    }
}
