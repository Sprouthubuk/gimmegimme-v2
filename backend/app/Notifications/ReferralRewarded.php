<?php

namespace App\Notifications;

use App\Models\Referral;
use App\Models\Setting;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** A referral qualified: the player's free tickets (or bonus credit) are waiting. */
class ReferralRewarded extends Notification
{
    use Queueable;

    public function __construct(public Referral $referral, public bool $toReferrer) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $site = rtrim((string) config('app.frontend_url'), '/');
        $credit = Setting::get('referral_reward_type') === 'credit';
        $what = $credit ? '£'.number_format(((int) Setting::get('referral_reward_credit_pence')) / 100, 2).' bonus credit'
            : ((int) Setting::get('referral_reward_tickets')).' free tickets';
        $why = $this->toReferrer ? 'Your friend joined with your link and made their first purchase.' : 'Thanks for joining with a friend’s link.';

        return (new MailMessage)->subject('You’ve Unlocked '.ucwords($what).'!')
            ->greeting('Hi '.$notifiable->first_name.',')
            ->line($why.' You’ve unlocked '.$what.'.')
            ->line($credit ? 'It’s in your wallet as bonus credit: spend only, it can’t be withdrawn.' : 'Choose any live draw to use them on. They’re entered exactly like paid tickets.')
            ->action($credit ? 'See Your Wallet' : 'Choose A Draw', $site.($credit ? '/account/wallet' : '/account/refer'))
            ->line('18+ UK only. Please play responsibly.')
            ->salutation('The Gimme Gimme team');
    }
}
