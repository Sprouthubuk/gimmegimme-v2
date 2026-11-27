<?php

namespace Tests\Feature;

use App\Support\ConsentChoices;
use Filament\Auth\MultiFactor\App\AppAuthentication;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The cookie banner's choices, counted per UK day as totals only: no id, no IP, no cookie, nothing that could
 * tell one visitor from another. The count is made after the visitor has chosen, and sets nothing on their device.
 */
class ConsentChoicesTest extends TestCase
{
    public function test_choices_are_counted_per_day_as_totals_only(): void
    {
        Carbon::setTestNow('2026-11-27 23:30:00'); // 23:30 UTC is still 27 Nov in the UK (GMT)
        $site = rtrim((string) config('app.url'), '/');
        $from = ['Origin' => $site, 'Referer' => $site.'/competitions/x'];

        $this->postJson('/api/consent-choice', ['choice' => 'accepted'], $from)->assertNoContent()->assertCookieMissing('gimme_session');
        $this->postJson('/api/consent-choice', ['choice' => 'accepted'], $from)->assertNoContent();
        $this->postJson('/api/consent-choice', ['choice' => 'rejected'], $from)->assertNoContent();
        $this->postJson('/api/consent-choice', ['choice' => 'maybe'], $from)->assertStatus(422);
        $this->postJson('/api/consent-choice', [], $from)->assertStatus(422);

        $r = $this->postJson('/api/consent-choice', ['choice' => 'rejected'], $from);
        $this->assertSame([], $r->headers->getCookies(), 'counting sets nothing on the visitor\'s device');

        $this->assertSame([['day' => '2026-11-27', 'accepted' => 2, 'rejected' => 2]],
            DB::table('consent_choices')->get(['day', 'accepted', 'rejected'])->map(fn ($x) => ['day' => (string) $x->day, 'accepted' => (int) $x->accepted, 'rejected' => (int) $x->rejected])->all());

        // Nothing that could identify anyone is kept: the table is a day and two numbers.
        $this->assertEqualsCanonicalizing(['day', 'accepted', 'rejected', 'created_at', 'updated_at'], Schema::getColumnListing('consent_choices'));

        Carbon::setTestNow('2026-11-28 00:30:00');
        ConsentChoices::record('accepted');
        $this->assertSame(
            ['2026-11-28' => ['accepted' => 1, 'rejected' => 0], '2026-11-27' => ['accepted' => 2, 'rejected' => 2]],
            array_slice(ConsentChoices::daily(3), 0, 2, true),
        );
        Carbon::setTestNow();
    }

    public function test_the_admin_sees_the_accept_rate(): void
    {
        ConsentChoices::record('accepted');
        ConsentChoices::record('accepted');
        ConsentChoices::record('accepted');
        ConsentChoices::record('rejected');

        $a = $this->admin();
        $a->saveAppAuthenticationSecret(app(AppAuthentication::class)->generateSecret());
        $this->actingAs($a->refresh(), 'web')->get('/admin/meta-tracking-report')->assertOk()
            ->assertSee('Cookie Banner Choices')->assertSee('75%');
    }
}
