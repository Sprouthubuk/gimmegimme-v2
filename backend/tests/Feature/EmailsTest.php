<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\IdCheck;
use App\Models\Order;
use App\Models\OrderLine;
use App\Models\PrizeClaim;
use App\Models\Referral;
use App\Models\Withdrawal;
use App\Notifications\AdminAlert;
use App\Notifications\IdCheckResult;
use App\Notifications\OrderReceipt;
use App\Notifications\PostalEntryEntered;
use App\Notifications\PrizeWon;
use App\Notifications\ReferralRewarded;
use App\Notifications\WithdrawalUpdate;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use App\Models\HuntClaim;
use App\Models\HuntTheme;
use App\Notifications\HuntPrizeRevealed;
use App\Notifications\HuntReminder;
use App\Notifications\HuntSymbolFound;
use Tests\TestCase;

/** Every email the site sends: Gimme Gimme design, our own wording, Title Case subjects, safe text. */
class EmailsTest extends TestCase
{
    private function render(Notification $n, $user): array
    {
        /** @var MailMessage $m */
        $m = $n->toMail($user);
        $html = (string) $m->render();
        // EMAIL_PREVIEWS=/some/folder writes each email out to look at (php artisan test --filter=EmailsTest).
        if ($dir = getenv('EMAIL_PREVIEWS')) {
            @mkdir($dir, 0777, true);
            file_put_contents($dir.'/'.preg_replace('/[^a-z0-9]+/i', '-', strtolower($m->subject)).'.html', $html);
        }

        return [$m, $html];
    }

    private static function huntClaim(array $attrs = []): HuntClaim
    {
        $c = (new Competition(['title' => 'The Christmas Bauble Hunt', 'type' => 'instant', 'slug' => 'bauble-hunt']))
            ->setRelation('huntTheme', new HuntTheme(['symbol_name' => 'Mystery Bauble', 'hashtag' => '#BaubleHunt', 'facebook_url' => 'https://www.facebook.com/groups/gimme']));

        return (new HuntClaim)->forceFill($attrs + ['ticket_number' => 4821, 'status' => 'found', 'found_at' => now(), 'deadline_at' => now()->addDays(2)])->setRelation('competition', $c);
    }

    private function assertBranded(string $html): void
    {
        $site = rtrim((string) config('app.frontend_url'), '/');
        $this->assertStringContainsString($site.'/logo.png', $html, 'logo (PNG, from the public site)');
        $this->assertStringContainsString('18+ UK only', $html);
        $this->assertStringContainsString('Free postal entry', $html);
        $this->assertStringContainsString($site.'/account/safer-play', $html);
        $this->assertStringContainsString('background-color: #fff23a', $html, 'the site\'s yellow button');
        $this->assertStringContainsString('border: 2px solid #ff2daa', $html, 'the neon pink card');
        $this->assertStringContainsString('#07050b', $html, 'dark site background');
        $this->assertStringNotContainsStringIgnoringCase('laravel', $html);
        $this->assertStringNotContainsString('All rights reserved', $html);
        $this->assertStringContainsString('The Gimme Gimme team', $html);
    }

    private function assertTitleCase(string $subject): void
    {
        foreach (preg_split('/\s+/u', $subject) as $word) {
            $first = mb_substr(preg_replace('/^[^\p{L}\p{N}]+/u', '', $word), 0, 1);
            if ($first !== '' && preg_match('/\p{L}/u', $first)) {
                $this->assertSame(mb_strtoupper($first), $first, "Title Case: \"$subject\"");
            }
        }
    }

    public function test_confirm_email(): void
    {
        $u = $this->player(['first_name' => 'Sam']);
        $n = new VerifyEmail;
        [$m, $html] = $this->render($n, $u);
        $this->assertSame('Confirm Your Email', $m->subject);
        $this->assertTitleCase($m->subject);
        $this->assertStringContainsString('Hi Sam,', $html);
        $this->assertStringContainsString('Confirm My Email', $html);
        $this->assertStringContainsString(route('verification.verify', ['id' => $u->id, 'hash' => sha1($u->email)], false), html_entity_decode($html));
        $this->assertBranded($html);
    }

    public function test_reset_password(): void
    {
        $u = $this->player(['first_name' => 'Sam']);
        [$m, $html] = $this->render(new ResetPassword('tok-123'), $u);
        $this->assertSame('Reset Your Password', $m->subject);
        $this->assertStringContainsString(rtrim((string) config('app.frontend_url'), '/').'/reset-password?token=tok-123&email='.urlencode($u->email), html_entity_decode($html));
        $this->assertStringContainsString('60 minutes', $html);
        $this->assertBranded($html);
    }

    public function test_receipts_and_prize(): void
    {
        $u = $this->player(['first_name' => 'Sam']);
        $c = new Competition(['title' => 'Win <b>£500</b> & More', 'type' => 'draw', 'prize_name' => '£500 <i>Cash</i>']);

        $deposit = new Order(['number' => 'GD-1001', 'order_type' => 'deposit', 'total_pence' => 1500]);
        [$m, $html] = $this->render(new OrderReceipt($deposit->setRelation('lines', collect())), $u);
        $this->assertSame('Top Up Received · GD-1001', $m->subject);
        $this->assertStringContainsString('£15.00', $html);
        $this->assertBranded($html);

        $line = (new OrderLine(['tickets' => [7, 42]]))->setRelation('competition', $c);
        $order = (new Order(['number' => 'GG-2002', 'order_type' => 'tickets', 'total_pence' => 200, 'wallet_pence' => 200, 'card_pence' => 0]))->setRelation('lines', collect([$line]));
        [$m, $html] = $this->render(new OrderReceipt($order), $u);
        $this->assertSame('You’re In! Order GG-2002', $m->subject);
        $this->assertTitleCase($m->subject);
        $this->assertStringContainsString('>#7</span>', $html);
        $this->assertStringContainsString('>#42</span>', $html);
        $this->assertStringContainsString('Total', $html);
        $this->assertStringNotContainsString('<b>£500</b>', $html, 'a competition title is escaped');
        $this->assertBranded($html);

        $claim = (new PrizeClaim)->forceFill(['prize_name' => '£500 <i>Cash</i>'])->setRelation('competition', $c);
        [$m, $html] = $this->render(new PrizeWon($claim), $u);
        $this->assertStringStartsWith('You Won! ', $m->subject);
        $this->assertStringNotContainsString('<i>Cash</i>', $html, 'a prize name is escaped');
        $this->assertBranded($html);
    }

    public function test_order_receipt_explains_bundles_box_bonus_and_vouchers(): void
    {
        $u = $this->player(['first_name' => 'Sam']);
        $c = new Competition(['title' => 'Meta Quest 3S 128GB', 'type' => 'draw']);
        $bundle = (new OrderLine(['tickets' => range(101, 128), 'paid_quantity' => 10, 'free_quantity' => 15, 'bonus_quantity' => 3, 'source' => 'gimme_box']))->setRelation('competition', $c);
        $many = (new OrderLine(['tickets' => range(1, 75), 'paid_quantity' => 75]))->setRelation('competition', new Competition(['title' => 'Ninja Crispi', 'type' => 'draw']));
        $order = (new Order(['number' => 'GG-3003', 'order_type' => 'tickets', 'total_pence' => 1940, 'wallet_pence' => 440, 'card_pence' => 1500]))->setRelation('lines', collect([$bundle, $many]));
        [, $html] = $this->render(new OrderReceipt($order), $u);
        $this->assertStringContainsString('28 tickets · 10 paid + 15 free + 3 Gimme Box bonus', $html);
        $this->assertStringContainsString('and 15 more in My Tickets', $html);
        $this->assertStringContainsString('By card', $html);
        $this->assertStringContainsString('£19.40', $html);
        $this->assertBranded($html);

        $voucher = (new OrderLine(['tickets' => range(301, 310), 'paid_quantity' => 0, 'source' => 'voucher']))->setRelation('competition', $c);
        $free = (new Order(['number' => 'GG-3004', 'order_type' => 'tickets', 'total_pence' => 0, 'wallet_pence' => 0, 'card_pence' => 0]))->setRelation('lines', collect([$voucher]));
        [, $html] = $this->render(new OrderReceipt($free), $u);
        $this->assertStringContainsString('free from your voucher', $html);
        $this->assertStringContainsString('Free', $html);
        $this->assertStringNotContainsString('£0.00', $html);
    }

    public function test_every_other_email_is_branded_with_a_title_case_subject(): void
    {
        $u = $this->player(['first_name' => 'Sam']);
        $c = new Competition(['title' => 'Shark FlexStyle 4-in-1 Air Styler', 'type' => 'draw']);
        $emails = [
            new PrizeWon((new PrizeClaim)->forceFill(['prize_name' => '£500 Cash', 'value_pence' => 50000, 'status' => 'fulfilled'])->setRelation('competition', $c)),
            new WithdrawalUpdate((new Withdrawal)->forceFill(['amount_pence' => 2500, 'status' => 'pending'])),
            new WithdrawalUpdate((new Withdrawal)->forceFill(['amount_pence' => 2500, 'status' => 'paid', 'note' => 'GG-W-1042'])),
            new WithdrawalUpdate((new Withdrawal)->forceFill(['amount_pence' => 2500, 'status' => 'rejected', 'note' => 'The name on the account didn’t match yours.'])),
            new IdCheckResult((new IdCheck)->forceFill(['status' => 'approved'])),
            new IdCheckResult((new IdCheck)->forceFill(['status' => 'rejected', 'note' => 'The photo was too blurry to read.'])),
            new PostalEntryEntered($c, [1234]),
            new ReferralRewarded(new Referral, true),
            new HuntSymbolFound($hunt = self::huntClaim()),
            new HuntReminder($hunt),
            new HuntPrizeRevealed(self::huntClaim(['status' => 'picked', 'number' => 7, 'prize_name' => '£10 Bauble Credit', 'prize_type' => 'ticket_credit', 'prize_value_pence' => 1000])),
        ];
        foreach ($emails as $n) {
            [$m, $html] = $this->render($n, $u);
            $this->assertTitleCase($m->subject);
            $this->assertBranded($html);
            $this->assertStringContainsString('Sam', $html);
        }
        [, $html] = $this->render($emails[8], $u);
        $this->assertStringContainsString('#BaubleHunt', $html);
        $this->assertStringContainsString('https://www.facebook.com/groups/gimme', $html);
        $this->assertStringContainsString('(UK time)', $html);
        [, $html] = $this->render($emails[10], $u);
        $this->assertStringContainsString('£10.00', $html);
        [, $html] = $this->render($emails[2], $u);
        $this->assertStringContainsString('GG-W-1042', $html);
        [, $html] = $this->render(new WithdrawalUpdate((new Withdrawal)->forceFill(['amount_pence' => 2500, 'status' => 'paid', 'note' => ''])), $u);
        $this->assertStringNotContainsString('Reference', $html, 'no empty reference line');
    }

    public function test_the_admin_test_email_shows_the_real_design(): void
    {
        [$m, $html] = $this->render(new \App\Notifications\TestEmail, new \Illuminate\Notifications\AnonymousNotifiable);
        $this->assertSame('Gimme Gimme Test Email', $m->subject);
        $this->assertStringContainsString('>#104</span>', $html);
        $this->assertStringContainsString('It isn’t a real order', $html);
        $this->assertBranded($html);
    }

    public function test_the_admin_alert_uses_the_same_design(): void
    {
        [$m, $html] = $this->render(new AdminAlert('Order GG-9 needs attention', ['A paid order could not get all its tickets.'], '/admin/orders'), new \Illuminate\Notifications\AnonymousNotifiable);
        $this->assertSame('[Gimme Gimme Admin] Order GG-9 needs attention', $m->subject);
        $this->assertStringContainsString('#07050b', $html);
        $this->assertStringContainsString('background-color: #fff23a', $html);
    }
}
