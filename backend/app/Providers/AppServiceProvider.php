<?php

namespace App\Providers;

use App\Payments\CashflowsGateway;
use App\Payments\FakeGateway;
use App\Payments\PaymentGateway;
use App\Services\Fulfilment;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Sprouthub\Verity\Events\InstantWinRevealed;
use Sprouthub\Verity\Events\WinnerDrawn;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(PaymentGateway::class, function ($app) {
            $driver = config('services.cashflows.driver');
            if ($driver === 'fake') {
                if ($app->environment('production')) {
                    throw new \RuntimeException('The fake payment gateway is never used in production.');
                }

                return new FakeGateway;
            }
            $c = config('services.cashflows');

            return new CashflowsGateway(rtrim((string) $c['base_url'], '/'), (string) $c['configuration_id'], (string) $c['api_key']);
        });
    }

    public function boot(): void
    {
        // Astro reaches Laravel on a private address (127.0.0.1:8080); links Laravel writes (emails, the
        // payment page's return addresses) always use the public one.
        if ($this->app->environment('production')) {
            URL::forceRootUrl((string) config('app.url'));
            URL::forceScheme('https');
        }

        // Instant wins are paid in the order's own transaction; this catches any played elsewhere. Idempotent.
        Event::listen(InstantWinRevealed::class, fn (InstantWinRevealed $e) => app(Fulfilment::class)->awardInstantWin($e->winner));
        Event::listen(WinnerDrawn::class, fn (WinnerDrawn $e) => app(Fulfilment::class)->recordDrawWin($e->winner));

        $site = rtrim((string) config('app.frontend_url'), '/');
        ResetPassword::createUrlUsing(fn ($user, string $token) => $site.'/reset-password?token='.urlencode($token).'&email='.urlencode($user->email));
        // The link goes straight to the API (same domain), which confirms and sends the player on to the site.
        VerifyEmail::createUrlUsing(fn ($user) => URL::temporarySignedRoute('verification.verify', now()->addHours(24),
            ['id' => $user->getKey(), 'hash' => sha1($user->getEmailForVerification())]));

        // Our own wording for the two account emails (Laravel's are generic). The design is the
        // Gimme Gimme mail theme (resources/views/vendor/mail).
        VerifyEmail::toMailUsing(fn ($user, string $url) => (new MailMessage)
            ->subject('Confirm Your Email')
            ->greeting('Hi '.($user->first_name ?: 'there').',')
            ->line('Welcome to Gimme Gimme Prizes! Tap the button to confirm your email and finish setting up your account.')
            ->action('Confirm My Email', $url)
            ->line('The link works for 24 hours. If you didn’t sign up, you can ignore this email and nothing will happen.')
            ->salutation('The Gimme Gimme team'));
        ResetPassword::toMailUsing(fn ($user, string $token) => (new MailMessage)
            ->subject('Reset Your Password')
            ->greeting('Hi '.($user->first_name ?: 'there').',')
            ->line('We got a request to reset the password for your Gimme Gimme account.')
            ->action('Choose A New Password', $site.'/reset-password?token='.urlencode($token).'&email='.urlencode($user->email))
            ->line('The link works for '.(int) config('auth.passwords.'.config('auth.defaults.passwords').'.expire', 60).' minutes. If you didn’t ask for this, ignore this email: your password stays the same.')
            ->salutation('The Gimme Gimme team'));

        RateLimiter::for('login', fn (Request $r) => [Limit::perMinute(5)->by('login|'.strtolower(trim((string) $r->input('email'))).'|'.$r->ip()), Limit::perMinute(30)->by('login|'.$r->ip())]);
        RateLimiter::for('password', fn (Request $r) => [Limit::perHour(5)->by('pw|'.strtolower(trim((string) $r->input('email')))), Limit::perHour(30)->by('pw|'.$r->ip())]);
        RateLimiter::for('signup', fn (Request $r) => Limit::perHour(10)->by($r->ip()));
        RateLimiter::for('contact', fn (Request $r) => Limit::perHour(5)->by($r->ip()));
        // Astro's server-side calls forward the visitor's IP (X-Forwarded-For from nginx; 127.0.0.1 is a trusted proxy).
        RateLimiter::for('api', fn (Request $r) => Limit::perMinute((int) config('app.api_rate_per_minute', 300))->by($r->user()?->id ?: $r->ip()));
        RateLimiter::for('money', fn (Request $r) => Limit::perMinute(20)->by($r->user()?->id ?: $r->ip()));
    }
}
