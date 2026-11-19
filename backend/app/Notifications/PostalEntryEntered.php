<?php

namespace App\Notifications;

use App\Models\Competition;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** A free postal entry has been entered: its ticket number. Any instant win shows in the account. */
class PostalEntryEntered extends Notification
{
    use Queueable;

    /** @param list<int> $tickets */
    public function __construct(public Competition $competition, public array $tickets) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $site = rtrim((string) config('app.frontend_url'), '/');
        $n = count($this->tickets);

        return (new MailMessage)->subject('Your Free Entry Is In: '.$this->competition->title)
            ->greeting('Hi '.$notifiable->first_name.',')
            ->line('We’ve received your postal entry and entered it.')
            ->markdown('notifications::email', ['blocks' => [['tickets', (string) $this->competition->title, $n.' free '.($n === 1 ? 'ticket' : 'tickets').' · by post', array_map('intval', $this->tickets)]]])
            ->line($this->competition->isInstant() ? 'Your ticket has been checked for an instant prize: see your tickets for the result.' : 'Good luck in the draw.')
            ->action('See Your Tickets', $site.'/account/tickets')
            ->salutation('The Gimme Gimme team');
    }
}
