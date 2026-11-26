<?php

namespace App\Notifications;

use App\Models\HuntClaim;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Once, a few hours before a find's claim window closes. */
class HuntReminder extends Notification
{
    use Queueable;

    public function __construct(public HuntClaim $claim) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return HuntMail::claimSteps($this->claim, (new MailMessage)
            ->subject('Don’t Forget Your '.HuntMail::symbol($this->claim))
            ->greeting('Hi '.$notifiable->first_name.',')
            ->line('You still haven’t picked a number for the '.HuntMail::symbol($this->claim).' you found in '.$this->claim->competition->title.'. If you don’t claim it in time, it isn’t won.'));
    }
}
