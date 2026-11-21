<?php

namespace App\Http\Controllers\Api;

use App\Tracking\MetaEvents;
use App\Http\Controllers\Controller;
use App\Http\Presenters\AccountPresenter;
use App\Models\User;
use App\Services\Referrals;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    private function present(): AccountPresenter
    {
        return app(AccountPresenter::class);
    }

    public function register(Request $r): JsonResponse
    {
        $r->merge(['email' => Str::lower(trim((string) $r->input('email')))]);
        $d = $r->validate([
            'firstName' => ['required', 'string', 'max:60'],
            'lastName' => ['required', 'string', 'max:60'],
            'email' => ['required', 'email:rfc', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', PasswordRule::min(8), 'max:200'],
            'dateOfBirth' => ['required', 'date_format:Y-m-d', 'before_or_equal:'.now()->subYears(18)->toDateString(), 'after:1900-01-01'],
            'marketingOptIn' => ['sometimes', 'boolean'],
            'referralCode' => ['sometimes', 'nullable', 'string', 'max:20'],
            'deviceId' => ['sometimes', 'nullable', 'string', 'max:64', 'regex:/^[A-Za-z0-9-]+$/'],
            'next' => ['sometimes', 'nullable', 'string', 'max:500'],
        ], [
            'email.unique' => "There's already an account with that email. Try logging in.",
            'dateOfBirth.before_or_equal' => 'You must be 18 or over to join.',
            'dateOfBirth.*' => 'Enter your date of birth.',
            'password.min' => 'Use at least 8 characters.',
        ]);
        $u = new User;
        $u->forceFill([
            'first_name' => trim($d['firstName']), 'last_name' => trim($d['lastName']), 'email' => Str::lower(trim($d['email'])),
            'password' => $d['password'], 'date_of_birth' => $d['dateOfBirth'],
            // Marketing is only ever added by a box the player ticked, dated when they ticked it.
            ...$u->marketingChoices(($d['marketingOptIn'] ?? false) === true, false),
        ])->save();
        // Refer a Friend: linked now or never. Device and IP are kept only as hashes, for the fraud checks.
        app(Referrals::class)->attach($u, $d['referralCode'] ?? null, $d['deviceId'] ?? null, $r->ip());
        // Where they were going (e.g. the checkout for the tickets they picked): the confirmation link
        // brings them back there, even when it's opened in another tab or browser.
        if (($next = self::safeNext($d['next'] ?? null)) !== null) {
            Cache::put('signup-next:'.$u->id, $next, now()->addDays(7));
        }
        try {
            event(new Registered($u)); // sends the confirmation email
        } catch (\Throwable $e) {
            Log::warning('Confirmation email not sent at sign-up', ['user' => $u->id]);
        }
        Auth::login($u);
        // The browser pixel sends the same id (reg-{id}), so Meta counts the sign-up once.
        app(MetaEvents::class)->remember($r, $u, 'CompleteRegistration', 'reg-'.$u->id);
        if ($r->hasSession()) {
            $r->session()->regenerate();
        }

        return response()->json($this->present()->me($u), 201);
    }

    public function login(Request $r): JsonResponse
    {
        $d = $r->validate(['email' => ['required', 'string'], 'password' => ['required', 'string'], 'remember' => ['sometimes', 'boolean']]);
        if (! Auth::attempt(['email' => Str::lower(trim($d['email'])), 'password' => $d['password'], 'closed_at' => null], (bool) ($d['remember'] ?? false))) {
            throw ValidationException::withMessages(['email' => ["Those details don't match an account."]]);
        }
        if ($r->hasSession()) {
            $r->session()->regenerate();
        }

        return response()->json($this->present()->me($r->user()));
    }

    public function logout(Request $r): JsonResponse
    {
        Auth::guard('web')->logout();
        if ($r->hasSession()) {
            $r->session()->invalidate();
            $r->session()->regenerateToken();
        }

        return response()->json(null, 204);
    }

    public function forgot(Request $r): JsonResponse
    {
        $r->validate(['email' => ['required', 'email']]);
        try {
            Password::sendResetLink(['email' => Str::lower(trim((string) $r->input('email')))]);
        } catch (\Throwable $e) {
            Log::warning('Password reset email not sent');
        }

        // Same answer whether or not the account exists.
        return response()->json(null, 204);
    }

    public function reset(Request $r): JsonResponse
    {
        $d = $r->validate(['token' => ['required', 'string'], 'email' => ['required', 'email'], 'password' => ['required', 'string', PasswordRule::min(8), 'max:200']]);
        $status = Password::reset(['email' => Str::lower($d['email'])] + $d, function (User $u, string $password) {
            $u->forceFill(['password' => $password, 'remember_token' => Str::random(60)])->save();
            event(new PasswordReset($u));
        });
        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['token' => ['That reset link has expired. Ask for a new one.']]);
        }

        return response()->json(null, 204);
    }

    public function resend(Request $r): JsonResponse
    {
        if (! $r->user()->hasVerifiedEmail()) {
            $r->user()->sendEmailVerificationNotification();
        }

        return response()->json(null, 204);
    }

    /** The link in the confirmation email (signed). Works without being signed in. */
    public function verify(Request $r, string $id, string $hash): RedirectResponse
    {
        $u = User::query()->findOrFail($id);
        abort_unless(hash_equals(sha1($u->getEmailForVerification()), $hash), 403);
        if (! $u->hasVerifiedEmail()) {
            $u->markEmailAsVerified();
        }

        $next = self::safeNext(Cache::pull('signup-next:'.$u->id));

        return redirect()->away(rtrim((string) config('app.frontend_url'), '/').'/verify-email?status=verified'.($next ? '&next='.rawurlencode($next) : ''));
    }

    /** A path on this site only, never another site, the API or the admin (the same rule as safeNext on the site). */
    private static function safeNext(mixed $next): ?string
    {
        if (! is_string($next) || $next === '' || strlen($next) > 500 || ! str_starts_with($next, '/') || str_starts_with($next, '//')
            || str_starts_with($next, '/\\') || preg_match('/[\x00-\x1f]/', $next) || preg_match('#^/(api|sanctum|admin)(/|$|\?)#', $next)) {
            return null;
        }

        return $next;
    }

    public function password(Request $r): JsonResponse
    {
        $d = $r->validate(['currentPassword' => ['required', 'string'], 'password' => ['required', 'string', PasswordRule::min(8), 'max:200']]);
        if (! Hash::check($d['currentPassword'], $r->user()->password)) {
            throw ValidationException::withMessages(['currentPassword' => ['Your current password is wrong.']]);
        }
        $r->user()->forceFill(['password' => $d['password']])->save();
        Auth::logoutOtherDevices($d['password']);

        return response()->json(null, 204);
    }
}
