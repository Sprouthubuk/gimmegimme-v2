<?php

namespace Tests\Feature;

use App\Models\Competition;
use App\Models\Order;
use App\Models\OrderLine;
use App\Models\PrizeClaim;
use App\Notifications\OrderReceipt;
use App\Notifications\PrizeWon;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Tests\TestCase;

/** Every email the site sends: Gimme Gimme design, our own wording, Title Case subjects, safe text. */
class EmailsTest extends TestCase
{
    private function render(Notification $n, $user): array
    {
        /** @var MailMessage $m */
        $m = $n->toMail($user);

        return [$m, (string) $m->render()];
    }

    private function assertBranded(string $html): void
    {
        $site = rtrim((string) config('app.frontend_url'), '/');
        $this->assertStringContainsString($site.'/logo.png', $html, 'logo (PNG, from the public site)');
        $this->assertStringContainsString('18+ UK only', $html);
        $this->assertStringContainsString('Free postal entry', $html);
        $this->assertStringContainsString($site.'/account/safer-play', $html);
        $this->assertStringContainsString('background-color: #d6007d', $html, 'button in the strong pink');
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
        $this->assertStringContainsString('#7, #42', $html);
        $this->assertStringNotContainsString('<b>£500</b>', $html, 'a competition title is escaped');
        $this->assertBranded($html);

        $claim = (new PrizeClaim)->forceFill(['prize_name' => '£500 <i>Cash</i>'])->setRelation('competition', $c);
        [$m, $html] = $this->render(new PrizeWon($claim), $u);
        $this->assertStringStartsWith('You Won! ', $m->subject);
        $this->assertStringNotContainsString('<i>Cash</i>', $html, 'a prize name is escaped');
        $this->assertBranded($html);
    }
}
