<?php

namespace App\Notifications;

use App\Models\HuntClaim;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** A ticket won a hunt symbol: how to claim it, and by when. */
class HuntSymbolFound extends Notification
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
            ->subject(HuntMail::symbol($this->claim).' Found: Pick Your Number')
            ->greeting('Well spotted, '.$notifiable->first_name.'!')
            ->line('Your ticket found a '.HuntMail::symbol($this->claim).' in '.$this->claim->competition->title.'. There’s a hidden prize behind it, and you choose which number to open.'));
    }
}
