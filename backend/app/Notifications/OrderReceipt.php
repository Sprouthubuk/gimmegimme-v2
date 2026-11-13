<?php

namespace App\Notifications;

use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Sent once an order is paid: what was bought and the ticket numbers. Never says what an instant-win
 * ticket won (the game reveals that).
 */
class OrderReceipt extends Notification
{
    use Queueable;

    public function __construct(public Order $order) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $o = $this->order->loadMissing('lines.competition');
        $site = rtrim((string) config('app.frontend_url'), '/');
        $money = fn (int $p) => '£'.number_format($p / 100, 2);
        if ($o->isDeposit()) {
            return (new MailMessage)->subject('Top Up Received · '.$o->number)
                ->greeting('Thanks, '.$notifiable->first_name)
                ->line($money($o->total_pence).' has been added to your Gimme Gimme wallet.')
                ->action('See Your Wallet', $site.'/account/wallet')
                ->line('Order '.$o->number.'. 18+ UK only. Please play responsibly.')
                ->salutation('The Gimme Gimme team');
        }
        $m = (new MailMessage)->subject('You’re In! Order '.$o->number)->greeting('You’re in, '.$notifiable->first_name.'!');
        foreach ($o->lines as $l) {
            if (! $l->tickets) {
                continue;
            }
            $n = count($l->tickets);
            $m->line('**'.e($l->competition->title).'** · '.$n.' '.($n === 1 ? 'ticket' : 'tickets').': '.implode(', ', array_map(fn ($t) => '#'.$t, array_slice($l->tickets, 0, 50))).($n > 50 ? ' …' : ''));
        }
        $paid = [];
        if ($o->wallet_pence) {
            $paid[] = $money($o->wallet_pence).' from your wallet';
        }
        if ($o->card_pence) {
            $paid[] = $money($o->card_pence).' by card';
        }

        return $m->line('Paid '.implode(' and ', $paid ?: [$money($o->total_pence)]).'.')
            ->action($o->lines->contains(fn ($l) => $l->competition->isInstant()) ? 'Play Your Games' : 'See Your Order', $site.'/order/'.$o->number)
            ->line('Your tickets are also in My Tickets. 18+ UK only. Please play responsibly.')
            ->salutation('The Gimme Gimme team');
    }
}
