<?php

namespace App\Notifications;

use App\Models\Withdrawal;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** A withdrawal was requested, paid or returned to the player's winnings. */
class WithdrawalUpdate extends Notification
{
    use Queueable;

    public function __construct(public Withdrawal $withdrawal) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $w = $this->withdrawal;
        $amount = '£'.number_format($w->amount_pence / 100, 2);
        $site = rtrim((string) config('app.frontend_url'), '/');
        $m = (new MailMessage)->greeting('Hi '.$notifiable->first_name.',');

        return match ($w->status) {
            'paid' => $m->subject('Your '.$amount.' withdrawal is on its way')
                ->line('We’ve sent '.$amount.' to your bank account. It normally arrives within a few hours, and always within 2 working days.')
                ->line('Reference: '.e((string) $w->note))
                ->action('See Your Wallet', $site.'/account/wallet')
                ->salutation('The Gimme Gimme team'),
            'rejected' => $m->subject('We couldn’t pay your '.$amount.' withdrawal')
                ->line('We couldn’t pay your withdrawal, so '.$amount.' is back in your winnings balance.')
                ->line('Why: '.e((string) $w->note))
                ->line('Reply to this email if you have any questions.')
                ->action('See Your Wallet', $site.'/account/wallet')
                ->salutation('The Gimme Gimme team'),
            default => $m->subject('We’ve got your '.$amount.' withdrawal request')
                ->line('Your request to withdraw '.$amount.' has been received and taken from your winnings balance.')
                ->line('We aim to pay within 5 working days. We’ll email you when it’s sent.')
                ->line('If you didn’t ask for this, reply to this email straight away.')
                ->salutation('The Gimme Gimme team'),
        };
    }
}
