<?php

namespace App\Notifications;

use App\Models\HuntClaim;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** The number a player picked has been opened: what was behind it, already paid. */
class HuntPrizeRevealed extends Notification
{
    use Queueable;

    public function __construct(public HuntClaim $claim) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $c = $this->claim->loadMissing('competition');
        $site = rtrim((string) config('app.frontend_url'), '/');
        $credit = $c->prize_type === 'ticket_credit';

        return (new MailMessage)->subject('Your '.HuntMail::symbol($c).' Prize: '.$c->prize_name)
            ->greeting('Congratulations, '.$notifiable->first_name.'!')
            ->line('We opened number '.$c->number.' for you. Here’s what was behind it.')
            ->markdown('notifications::email', ['blocks' => [['rows', [['Prize', (string) $c->prize_name], ['Number', (string) $c->number],
                ['Ticket', '#'.$c->ticket_number], ['Competition', (string) $c->competition->title]],
                $credit ? 'Added to your ticket credit' : 'Added to winnings', '£'.number_format(((int) $c->prize_value_pence) / 100, 2)]]])
            ->line($credit ? 'Ticket credit can be spent on tickets and expires on the date shown in your wallet.' : 'It’s in your winnings balance now. You can play with it or withdraw it.')
            ->action('See Your Wallet', $site.'/account/wallet')
            ->salutation('The Gimme Gimme team');
    }
}
