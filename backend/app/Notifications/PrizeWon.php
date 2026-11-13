<?php

namespace App\Notifications;

use App\Models\PrizeClaim;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** A draw win or a physical instant prize: we'll be in touch to arrange it. */
class PrizeWon extends Notification
{
    use Queueable;

    public function __construct(public PrizeClaim $claim) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $c = $this->claim->loadMissing('competition');
        $site = rtrim((string) config('app.frontend_url'), '/');

        return (new MailMessage)->subject('You Won! '.$c->prize_name)
            ->greeting('Congratulations, '.$notifiable->first_name.'!')
            ->line('You’ve won **'.e($c->prize_name).'** in '.e($c->competition->title).'.')
            ->line('We’ll contact you at this email address to arrange your prize. Check your address in your account settings is up to date.')
            ->action('Your Account', $site.'/account/settings')
            ->salutation('The Gimme Gimme team');
    }
}
