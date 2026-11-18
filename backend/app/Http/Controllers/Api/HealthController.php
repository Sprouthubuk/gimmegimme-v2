<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Sprouthub\Verity\Console\ProcessDueCommand;

/**
 * For an uptime monitor: 200 when the site can serve players, 503 when something needs a person.
 * Checks the database answers and the scheduler (which closes, draws and opens competitions every
 * minute) has run in the last 5 minutes. Says only ok / failing: no figures, nothing private.
 */
class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $checks = [];
        try {
            DB::select('select 1');
            $checks['database'] = 'ok';
        } catch (\Throwable $e) {
            $checks['database'] = 'failing';
        }
        try {
            $last = Cache::get(ProcessDueCommand::HEARTBEAT);
            $checks['scheduler'] = $last !== null && now()->getTimestamp() - (int) $last <= 300 ? 'ok' : 'failing';
        } catch (\Throwable $e) {
            $checks['scheduler'] = 'failing';
        }
        $ok = ! in_array('failing', $checks, true);

        return response()->json(['status' => $ok ? 'ok' : 'failing', 'checks' => $checks], $ok ? 200 : 503)
            ->header('Cache-Control', 'no-store');
    }
}
