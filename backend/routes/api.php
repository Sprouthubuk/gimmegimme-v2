<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\ArchiveController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\FakePayController;
use App\Http\Controllers\Api\GimmeBoxController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PublicController;
use App\Http\Controllers\Api\ReferralController;
use Illuminate\Support\Facades\Route;

// The contract is docs/api.md. Everything here is under /api.

Route::middleware('throttle:api')->group(function () {
    Route::get('health', HealthController::class);
    Route::get('site', [PublicController::class, 'site']);
    Route::get('competitions', [PublicController::class, 'competitions']);
    Route::get('competitions/{slug}', [PublicController::class, 'competition']);
    Route::get('competitions/{slug}/winning-numbers', [PublicController::class, 'winningNumbers']);
    Route::get('competitions/{slug}/live-draw', [PublicController::class, 'liveDraw']);
    Route::post('competitions/{slug}/live-draw/publish', [PublicController::class, 'publishLiveDraw'])->middleware('throttle:10,1');
    Route::get('winners/instant', [PublicController::class, 'instantWinners']);
    Route::get('winners/draws', [PublicController::class, 'drawWinners']);
    Route::get('entry-lists', [PublicController::class, 'entryLists']);
    Route::get('entry-lists/{slug}', [PublicController::class, 'entryList']);
    // The old site's public record (read-only archive, gimme:import-archive).
    Route::get('archive', [ArchiveController::class, 'index']);
    Route::get('archive/winners', [ArchiveController::class, 'winners']);
    Route::get('archive/{slug}', [ArchiveController::class, 'show']);
    Route::get('archive/{slug}/instant-wins', [ArchiveController::class, 'instantWins']);
    Route::get('archive/{slug}/entries', [ArchiveController::class, 'entries']);
    Route::get('pages/{slug}', [PublicController::class, 'page']);
    Route::post('contact', [PublicController::class, 'contact'])->middleware('throttle:contact');
    Route::post('basket/price', [OrderController::class, 'price']);
    Route::post('gimme-box', [GimmeBoxController::class, 'build'])->middleware('throttle:gimme-box');
    Route::post('gimme-box/{id}/added', [GimmeBoxController::class, 'added'])->middleware('throttle:gimme-box');
    Route::get('referrals/{code}', [ReferralController::class, 'invite'])->middleware('throttle:gimme-box');

    Route::prefix('auth')->group(function () {
        Route::post('register', [AuthController::class, 'register'])->middleware('throttle:signup');
        Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
        Route::post('logout', [AuthController::class, 'logout']);
        Route::post('forgot-password', [AuthController::class, 'forgot'])->middleware('throttle:password');
        Route::post('reset-password', [AuthController::class, 'reset'])->middleware('throttle:password');
        Route::get('email/verify/{id}/{hash}', [AuthController::class, 'verify'])->middleware('signed')->name('verification.verify');
        Route::post('email/resend', [AuthController::class, 'resend'])->middleware(['auth:sanctum', 'throttle:6,1']);
    });

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('me', [AccountController::class, 'me']);
        Route::get('me/wallet/transactions', [AccountController::class, 'transactions']);
        Route::get('me/tickets', [AccountController::class, 'tickets']);
        Route::get('me/tickets/{number}/{competition}', [AccountController::class, 'ticketPage']);
        Route::get('me/limits', [AccountController::class, 'limits']);
        Route::post('me/limits', [AccountController::class, 'setLimits']);
        Route::post('me/break', [AccountController::class, 'takeBreak']);
        Route::post('me/self-exclude', [AccountController::class, 'selfExclude']);
        Route::patch('me/profile', [AccountController::class, 'profile']);
        Route::patch('me/address', [AccountController::class, 'address']);
        Route::patch('me/date-of-birth', [AccountController::class, 'dateOfBirth'])->middleware('throttle:10,1');
        Route::patch('me/preferences', [AccountController::class, 'preferences']);
        Route::post('me/password', [AuthController::class, 'password'])->middleware('throttle:login');
        Route::post('me/deposits', [AccountController::class, 'deposit'])->middleware('throttle:money');
        Route::post('me/withdrawals', [AccountController::class, 'withdraw'])->middleware('throttle:money');
        Route::post('me/id-check', [AccountController::class, 'idCheck'])->middleware('throttle:money');

        Route::post('checkout', [OrderController::class, 'checkout'])->middleware('throttle:money');
        Route::post('competitions/{slug}/free-entry', [OrderController::class, 'freeEntry'])->middleware('throttle:money');
        Route::get('orders/{number}', [OrderController::class, 'show']);
        Route::post('orders/{number}/return', [OrderController::class, 'return']);
        Route::post('orders/{number}/play', [OrderController::class, 'play']);
        Route::get('me/referrals', [ReferralController::class, 'mine']);
        Route::get('me/vouchers/{voucher}/draws', [ReferralController::class, 'draws']);
        Route::post('me/vouchers/{voucher}/redeem', [ReferralController::class, 'redeem'])->middleware('throttle:money');
    });
});

Route::post('webhooks/cashflows', [OrderController::class, 'webhook'])->middleware('throttle:120,1');

// The stand-in payment page, only when the fake gateway is in use (never in production).
if (config('services.cashflows.driver') === 'fake' && ! app()->environment('production')) {
    Route::get('fake-pay/{ref}', [FakePayController::class, 'page']);
    Route::get('fake-pay/{ref}/{result}', [FakePayController::class, 'settle'])->whereIn('result', ['paid', 'failed', 'cancelled']);
}
