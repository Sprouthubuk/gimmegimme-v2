<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification as Notifier;

/**
 * Something in the admin needs a person: a withdrawal to pay, ID to check, an order needing attention.
 * Sent to ADMIN_ALERT_EMAILS (comma separated), or the contact inbox when that isn't set.
 */
class AdminAlert extends Notification
{
    use Queueable;

    /** @param list<string> $lines */
    public function __construct(public string $subject, public array $lines, public string $path) {}

    /** @param list<string>|null $to who to tell; null: the usual alert addresses (ADMIN_ALERT_EMAILS, else CONTACT_INBOX). */
    public static function send(string $subject, array $lines, string $path, ?array $to = null): void
    {
        $to ??= array_values(array_filter(array_map('trim', explode(',', (string) (config('app.alert_emails') ?: config('app.contact_inbox'))))));
        if ($to === []) {
            return;
        }
        try {
            Notifier::route('mail', $to)->notify(new self($subject, $lines, $path));
        } catch (\Throwable $e) {
            Log::warning('Admin alert not sent', ['subject' => $subject]); // still on the dashboard
        }
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $m = (new MailMessage)->subject('[Gimme Gimme Admin] '.$this->subject);
        foreach ($this->lines as $line) {
            $m->line($line);
        }

        return $m->action('Open The Admin', rtrim((string) config('app.url'), '/').$this->path)->salutation('Gimme Gimme');
    }
}
