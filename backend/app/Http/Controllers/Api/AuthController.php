<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Presenters\AccountPresenter;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
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
            // Marketing is only ever added by a box the player ticked.
            'marketing_email' => ($d['marketingOptIn'] ?? false) === true, 'marketing_sms' => false,
        ])->save();
        event(new Registered($u));
        Auth::login($u);
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
        Password::sendResetLink(['email' => Str::lower(trim((string) $r->input('email')))]);

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

        return redirect()->away(rtrim((string) config('app.frontend_url'), '/').'/verify-email?status=verified');
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
