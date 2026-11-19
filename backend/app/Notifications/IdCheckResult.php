<?php

namespace App\Notifications;

use App\Models\IdCheck;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** The result of the ID check before a player's first withdrawal. */
class IdCheckResult extends Notification
{
    use Queueable;

    public function __construct(public IdCheck $check) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $site = rtrim((string) config('app.frontend_url'), '/');
        $m = (new MailMessage)->greeting('Hi '.$notifiable->first_name.',');
        if ($this->check->status === 'approved') {
            return $m->subject('Your ID Check Is Done')
                ->line('Thanks, we’ve checked your ID. You can now withdraw your winnings.')
                ->action('Withdraw Winnings', $site.'/account/wallet#withdraw')
                ->salutation('The Gimme Gimme team');
        }

        return $m->subject('We Need Another Look At Your ID')
            ->line('We couldn’t complete your ID check with the documents you sent.')
            ->line('Why: '.(string) $this->check->note)
            ->line('Please send new documents from your wallet page.')
            ->action('Send Documents', $site.'/account/wallet#withdraw')
            ->salutation('The Gimme Gimme team');
    }
}
