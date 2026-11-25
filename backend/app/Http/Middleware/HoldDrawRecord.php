<?php

namespace App\Http\Middleware;

use App\Models\Competition;
use App\Services\DrawResults;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Verity's public record of a draw (/verity/competitions/{ref}/verification and /verity/audit?competition={ref})
 * names the winning ticket, so while a draw's result is held for the live reveal (DrawResults) the record waits too.
 * It answers 423 with a plain message until the result is published; then the full record, unchanged.
 */
class HoldDrawRecord
{
    public function handle(Request $request, Closure $next): Response
    {
        $ref = (string) ($request->route('ref') ?? $request->query('competition', ''));
        if ($ref !== '') {
            $c = Competition::query()->where('verity_ref', $ref)->first();
            if ($c !== null && DrawResults::held($c)) {
                return response()->json(['message' => 'This draw’s result is being revealed live. The full record appears here as soon as the winner is announced.'], 423)
                    ->header('Cache-Control', 'no-store');
            }
        }

        return $next($request);
    }
}
