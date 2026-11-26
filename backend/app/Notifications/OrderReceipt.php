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
                ->greeting('Thanks, '.$notifiable->first_name.'!')
                ->line('Your top up is in your Gimme Gimme wallet, ready to play.')
                ->markdown('notifications::email', ['blocks' => [['rows', [['Order', $o->number]], 'Added', $money($o->total_pence)]]])
                ->action('See Your Wallet', $site.'/account/wallet')
                ->line('18+ UK only. Please play responsibly.')
                ->salutation('The Gimme Gimme team');
        }

        $blocks = [];
        foreach ($o->lines as $l) {
            if (! $l->tickets) {
                continue;
            }
            $n = count($l->tickets);
            // A bundle shows its paid and free tickets separately; box bonus and voucher tickets say so.
            $parts = [];
            if ($l->source === 'voucher') {
                $parts[] = 'free from your voucher';
            } elseif ($l->source === 'free_entry') {
                $parts[] = 'free entry';
            } else {
                if ($l->free_quantity > 0 || $l->bonus_quantity > 0) {
                    $parts[] = ((int) $l->paid_quantity).' paid';
                }
                if ($l->free_quantity > 0) {
                    $parts[] = ((int) $l->free_quantity).' free';
                }
                if ($l->bonus_quantity > 0) {
                    $parts[] = ((int) $l->bonus_quantity).' Gimme Box bonus';
                }
            }
            $sub = number_format($n).' '.($n === 1 ? 'ticket' : 'tickets').($parts ? ' · '.implode(' + ', $parts) : '');
            $blocks[] = ['tickets', (string) $l->competition->title, $sub, array_map('intval', $l->tickets)];
        }
        $rows = [['Order', $o->number]];
        if ($o->wallet_pence) {
            $rows[] = ['From your wallet', $money($o->wallet_pence)];
        }
        if ($o->card_pence) {
            $rows[] = ['By card', $money($o->card_pence)];
        }
        $blocks[] = ['rows', $rows, 'Total', $o->total_pence > 0 ? $money($o->total_pence) : 'Free'];
        $instant = $o->lines->contains(fn ($l) => $l->competition->isInstant());

        return (new MailMessage)->subject('You’re In! Order '.$o->number)
            ->greeting('You’re in, '.$notifiable->first_name.'!')
            ->line($instant ? 'Your tickets are ready. Play your reveal games to see if you’ve won an instant prize.' : 'Your tickets are in. Here are your ticket numbers. Good luck in the draw!')
            ->markdown('notifications::email', ['blocks' => $blocks])
            ->action($instant ? 'Play Your Games' : 'See Your Order', $site.'/order/'.$o->number)
            ->line('Your tickets are also in My Tickets. 18+ UK only. Please play responsibly.')
            ->salutation('The Gimme Gimme team');
    }
}
