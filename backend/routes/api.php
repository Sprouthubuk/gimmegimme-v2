<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\FakePayController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PublicController;
use Illuminate\Support\Facades\Route;

// The contract is docs/api.md. Everything here is under /api.

Route::middleware('throttle:api')->group(function () {
    Route::get('site', [PublicController::class, 'site']);
    Route::get('competitions', [PublicController::class, 'competitions']);
    Route::get('competitions/{slug}', [PublicController::class, 'competition']);
    Route::get('winners/instant', [PublicController::class, 'instantWinners']);
    Route::get('winners/draws', [PublicController::class, 'drawWinners']);
    Route::get('entry-lists', [PublicController::class, 'entryLists']);
    Route::get('entry-lists/{slug}', [PublicController::class, 'entryList']);
    Route::get('pages/{slug}', [PublicController::class, 'page']);
    Route::post('contact', [PublicController::class, 'contact'])->middleware('throttle:contact');
    Route::post('basket/price', [OrderController::class, 'price']);

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
        Route::get('me/limits', [AccountController::class, 'limits']);
        Route::post('me/limits', [AccountController::class, 'setLimits']);
        Route::post('me/break', [AccountController::class, 'takeBreak']);
        Route::post('me/self-exclude', [AccountController::class, 'selfExclude']);
        Route::patch('me/profile', [AccountController::class, 'profile']);
        Route::patch('me/address', [AccountController::class, 'address']);
        Route::patch('me/preferences', [AccountController::class, 'preferences']);
        Route::post('me/password', [AuthController::class, 'password'])->middleware('throttle:login');
        Route::post('me/deposits', [AccountController::class, 'deposit'])->middleware('throttle:money');
        Route::post('me/withdrawals', [AccountController::class, 'withdraw'])->middleware('throttle:money');

        Route::post('checkout', [OrderController::class, 'checkout'])->middleware('throttle:money');
        Route::get('orders/{number}', [OrderController::class, 'show']);
        Route::post('orders/{number}/return', [OrderController::class, 'return']);
        Route::post('orders/{number}/play', [OrderController::class, 'play']);
    });
});

Route::post('webhooks/cashflows', [OrderController::class, 'webhook'])->middleware('throttle:120,1');

// The stand-in payment page, only when the fake gateway is in use (never in production).
if (config('services.cashflows.driver') === 'fake' && ! app()->environment('production')) {
    Route::get('fake-pay/{ref}', [FakePayController::class, 'page']);
    Route::get('fake-pay/{ref}/{result}', [FakePayController::class, 'settle'])->whereIn('result', ['paid', 'failed', 'cancelled']);
}
