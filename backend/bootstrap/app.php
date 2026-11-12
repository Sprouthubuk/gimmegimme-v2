<?php

use App\Exceptions\RefusedException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

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
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (RefusedException $e) {
            return response()->json(array_filter(['message' => $e->getMessage(), 'code' => $e->reason, 'errors' => $e->fields ?: null]), $e->status);
        });
        $exceptions->render(function (DomainException $e, Request $r) {
            if ($r->is('api/*')) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
        });
        $exceptions->shouldRenderJsonWhen(fn (Request $r) => $r->is('api/*') || $r->expectsJson());
    })->create();
