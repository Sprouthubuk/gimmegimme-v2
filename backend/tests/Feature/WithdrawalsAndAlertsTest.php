<?php

namespace Tests\Feature;

use App\Filament\Resources\IdChecks\Pages\ListIdChecks;
use App\Filament\Resources\Withdrawals\Pages\ListWithdrawals;
use App\Models\IdCheck;
use App\Models\Order;
use App\Models\Withdrawal;
use App\Notifications\AdminAlert;
use App\Notifications\IdCheckResult;
use App\Notifications\PostalEntryEntered;
use App\Notifications\WithdrawalUpdate;
use App\Services\Fulfilment;
use App\Services\Postal;
use Filament\Auth\MultiFactor\App\AppAuthentication;
use Filament\Facades\Filament;
use Illuminate\Http\UploadedFile;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;
use Tests\TestCase;

/** Withdrawals with bank details, the ID check before the first one, the emails players get, and alerts to the admins. */
class WithdrawalsAndAlertsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Storage::fake('local');
        config(['app.alert_emails' => 'owner@example.com, ops@example.com']);
    }

    private function admin2fa()
    {
        $a = $this->admin();
        $a->saveAppAuthenticationSecret(app(AppAuthentication::class)->generateSecret());
        $this->actingAs($a->refresh());
        Filament::setCurrentPanel('admin');

        return $a;
    }

    private function alerted(string $subjectStart): bool
    {
        $found = false;
        Notification::assertSentTo(new AnonymousNotifiable, AdminAlert::class, function (AdminAlert $n, $channels, $notifiable) use ($subjectStart, &$found) {
            $found = $found || (str_starts_with($n->subject, $subjectStart) && $notifiable->routes['mail'] === ['owner@example.com', 'ops@example.com']);

            return true;
        });

        return $found;
    }

    public function test_id_check_then_a_withdrawal_with_bank_details_paid_by_an_admin(): void
    {
        $u = $this->player(['first_name' => 'Liam', 'last_name' => 'Player']);
        $this->topUp($u, 5000, 'winnings');
        $this->actingAs($u)->getJson('/api/me')->assertJsonPath('idCheck', 'needed');
        $bank = ['accountName' => 'Liam O’Leary-Player', 'sortCode' => '12-34-56', 'accountNumber' => '1234 5678'];
        $this->postJson('/api/me/withdrawals', ['amountPence' => 2000] + $bank)->assertStatus(403)->assertJsonPath('code', 'id_required');

        // Documents: both needed, photos or PDFs only.
        $this->post('/api/me/id-check', ['photoId' => UploadedFile::fake()->image('passport.jpg')], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('proofOfAddress');
        $this->post('/api/me/id-check', ['photoId' => UploadedFile::fake()->create('x.exe', 10), 'proofOfAddress' => UploadedFile::fake()->create('bill.pdf', 200, 'application/pdf')], ['Accept' => 'application/json'])->assertJsonValidationErrors('photoId');
        $this->post('/api/me/id-check', ['photoId' => UploadedFile::fake()->image('passport.jpg'), 'proofOfAddress' => UploadedFile::fake()->create('bill.pdf', 200, 'application/pdf')], ['Accept' => 'application/json'])->assertCreated();
        $check = IdCheck::query()->sole();
        Storage::disk('local')->assertExists([$check->photo_path, $check->address_path]);
        $this->assertStringStartsWith('id-checks/'.$u->id.'/', $check->photo_path);
        $this->getJson('/api/me')->assertJsonPath('idCheck', 'pending');
        $this->post('/api/me/id-check', ['photoId' => UploadedFile::fake()->image('a.jpg'), 'proofOfAddress' => UploadedFile::fake()->image('b.jpg')], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonPath('code', 'id_pending');
        $this->assertTrue($this->alerted('ID to check'));

        // Only an admin who has finished two-step sign-in can open a document.
        $this->get(route('admin.id-check-file', [$check, 'photo']))->assertForbidden();
        $plain = $this->admin();
        $this->actingAs($plain)->get(route('admin.id-check-file', [$check, 'photo']))->assertForbidden();
        $this->admin2fa();
        $this->get(route('admin.id-check-file', [$check, 'photo']))->assertOk();
        $this->get(route('admin.id-check-file', [$check, 'nope']))->assertNotFound();

        Livewire::test(ListIdChecks::class)->callTableAction('approve', $check);
        $this->assertNotNull($u->refresh()->id_verified_at);
        Notification::assertSentTo($u, IdCheckResult::class, fn ($n) => $n->check->status === 'approved');

        // The withdrawal: bank details checked, stored encrypted, never sent back to the browser.
        $this->actingAs($u)->postJson('/api/me/withdrawals', ['amountPence' => 2000, 'accountName' => 'L', 'sortCode' => '123', 'accountNumber' => '12'])
            ->assertJsonValidationErrors(['accountName', 'sortCode', 'accountNumber']);
        $this->postJson('/api/me/withdrawals', ['amountPence' => 2000] + $bank)->assertCreated();
        $w = Withdrawal::query()->sole();
        $this->assertSame(['Liam O’Leary-Player', '123456', '12345678'], [$w->account_name, $w->sort_code, $w->account_number]);
        $raw = (array) DB::table('withdrawals')->where('id', $w->id)->first(['sort_code', 'account_number']);
        $this->assertStringNotContainsString('123456', implode(' ', $raw), 'encrypted at rest');
        $this->assertArrayNotHasKey('account_number', $w->toArray());
        Notification::assertSentTo($u, WithdrawalUpdate::class, fn ($n) => $n->withdrawal->status === 'requested');
        $this->assertTrue($this->alerted('Withdrawal to pay'));

        $this->admin2fa();
        Livewire::test(ListWithdrawals::class)->assertSee('12-34-56')->callTableAction('paid', $w, ['note' => 'FPS ref 991']);
        Notification::assertSentTo($u, WithdrawalUpdate::class, fn ($n) => $n->withdrawal->status === 'paid');
        Livewire::test(ListWithdrawals::class)->assertDontSee('12-34-56'); // hidden once paid
    }

    public function test_rejected_documents_can_be_sent_again(): void
    {
        $u = $this->player();
        $this->actingAs($u)->post('/api/me/id-check', ['photoId' => UploadedFile::fake()->image('a.jpg'), 'proofOfAddress' => UploadedFile::fake()->image('b.jpg')], ['Accept' => 'application/json'])->assertCreated();
        $this->admin2fa();
        Livewire::test(ListIdChecks::class)->callTableAction('reject', IdCheck::query()->sole(), ['note' => 'The photo is blurred']);
        Notification::assertSentTo($u, IdCheckResult::class, fn ($n) => $n->check->status === 'rejected');
        $this->actingAs($u)->getJson('/api/me')->assertJsonPath('idCheck', 'rejected')->assertJsonPath('idCheckNote', 'The photo is blurred');
        $this->post('/api/me/id-check', ['photoId' => UploadedFile::fake()->image('c.jpg'), 'proofOfAddress' => UploadedFile::fake()->image('d.jpg')], ['Accept' => 'application/json'])->assertCreated();
        $this->assertNull($u->refresh()->id_verified_at);
    }

    public function test_a_postal_entry_is_emailed_with_its_ticket_number(): void
    {
        $u = $this->player(['email' => 'post@example.com']);
        $c = $this->competition('draw');
        app(Postal::class)->log($c, 'post@example.com', now(), $this->admin());
        Notification::assertSentTo($u, PostalEntryEntered::class, fn ($n) => count($n->tickets) === 1 && $n->tickets[0] > 0);
    }

    public function test_an_order_needing_attention_alerts_the_admins_once(): void
    {
        $u = $this->player();
        $o = Order::query()->create(['number' => 'GG-TEST1', 'user_id' => $u->id, 'order_type' => 'tickets', 'status' => 'paid', 'total_pence' => 100, 'card_pence' => 100, 'wallet_pence' => 0]);
        app(Fulfilment::class)->flag($o, 'Paid after the order had closed.');
        app(Fulfilment::class)->flag($o->refresh(), 'Something else.');
        $this->assertTrue($this->alerted('Order GG-TEST1 needs attention'));
        Notification::assertSentTimes(AdminAlert::class, 1);
    }
}
