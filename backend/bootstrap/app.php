<?php

use App\Exceptions\RefusedException;
use Illuminate\Foundation\Application;
use Sentry\Laravel\Integration;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Sanctum cookie sessions for the Astro site on the same domain.
        $middleware->statefulApi();
        // nginx on the same box is the only proxy.
        $middleware->trustProxies(at: ['127.0.0.1', '::1']);
        // Meta's own cookies and the cookie-banner choice are written in the browser, so they aren't encrypted.
        $middleware->encryptCookies(except: ['_fbp', '_fbc', 'gg_consent']);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Errors go to Sentry when SENTRY_LARAVEL_DSN is set (nothing is sent without it). Refusals a player
        // sees (limits, sold out, wrong details) are normal, not errors.
        Integration::handles($exceptions);
        $exceptions->dontReport([RefusedException::class, DomainException::class]);
        $exceptions->render(function (RefusedException $e) {
            return response()->json(array_filter(['message' => $e->getMessage(), 'code' => $e->reason, 'errors' => $e->fields ?: null]), $e->status);
        });
        $exceptions->render(function (DomainException $e, Request $r) {
            if ($r->is('api/*')) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
        });
        // "No query results for model [App\Models\…]" names an internal class: say "Not found." instead.
        $exceptions->render(function (NotFoundHttpException $e, Request $r) {
            if ($r->is('api/*')) {
                return response()->json(['message' => 'Not found.'], 404);
            }
        });
        $exceptions->shouldRenderJsonWhen(fn (Request $r) => $r->is('api/*') || $r->expectsJson());
    })->create();
