<?php

namespace Tests\Feature;

use Tests\TestCase;

/** A player with no date of birth (e.g. brought over from the old site) adds it once, 18+, and can then play. */
class DateOfBirthTest extends TestCase
{
    public function test_a_player_with_no_date_of_birth_adds_it_once_and_can_then_play(): void
    {
        $u = $this->player(['date_of_birth' => null]);
        $this->actingAs($u);
        $this->assertSame('no_date_of_birth', $this->getJson('/api/me')->json('playBlock'));

        $this->patchJson('/api/me/date-of-birth', ['dateOfBirth' => now()->subYears(17)->toDateString()])->assertStatus(422)->assertJsonValidationErrors('dateOfBirth');
        $this->patchJson('/api/me/date-of-birth', ['dateOfBirth' => 'not a date'])->assertStatus(422);
        $this->patchJson('/api/me/date-of-birth', ['dateOfBirth' => '1990-05-04'])->assertOk()->assertJsonPath('dobVerified', true);
        $this->assertSame('1990-05-04', $u->refresh()->date_of_birth->toDateString());
        $this->assertNull($this->getJson('/api/me')->json('playBlock'));

        // Once set, only we change it.
        $this->patchJson('/api/me/date-of-birth', ['dateOfBirth' => '1980-01-01'])->assertStatus(422)->assertJsonPath('code', 'fill_once');
        $this->assertSame('1990-05-04', $u->refresh()->date_of_birth->toDateString());
    }

    public function test_signed_out_visitors_cannot_set_one(): void
    {
        $this->patchJson('/api/me/date-of-birth', ['dateOfBirth' => '1990-05-04'])->assertUnauthorized();
    }
}
