<?php

namespace App\Notifications;

use App\Models\HuntClaim;
use Illuminate\Notifications\Messages\MailMessage;

/** The claim steps shared by the find and reminder emails. */
final class HuntMail
{
    public static function symbol(HuntClaim $claim): string
    {
        return (string) ($claim->competition->huntTheme?->symbol_name ?? 'Mystery Symbol');
    }

    public static function claimSteps(HuntClaim $claim, MailMessage $m): MailMessage
    {
        $c = $claim->competition;
        $theme = $c->huntTheme;
        $site = rtrim((string) config('app.frontend_url'), '/');
        $deadline = $claim->deadline_at->copy()->timezone('Europe/London')->format('l j F, g:ia');
        $m->markdown('notifications::email', ['blocks' => [['rows', [['Ticket', '#'.$claim->ticket_number], ['Competition', (string) $c->title], ['Claim by', $deadline.' (UK time)']]]]])
            ->line('How to claim: choose a number on the Hunt Board that nobody has picked yet.');
        if ($theme?->facebook_url) {
            $m->line('Post it in our Facebook group'.($theme->hashtag ? ' with '.$theme->hashtag : '').', with your ticket number: '.$theme->facebook_url)
                ->line('Not on Facebook? Reply to this email or use our contact form with your ticket number and the number you’ve chosen.');
        } else {
            $m->line('Reply to this email or use our contact form with your ticket number and the number you’ve chosen.');
        }

        return $m->line('We’ll open it and pay what’s behind it straight away. A number already taken can’t be picked again.')
            ->action('See the Hunt Board', $site.'/competitions/'.$c->slug.'#hunt-board')
            ->salutation('The Gimme Gimme team');
    }
}
