<?php

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Schedule as Scheduler;
use Sprouthub\Verity\Facades\Verity;

// Verity: publish, close, draw (on drand), redraws, audit chain checks and anchors.
Verity::schedule(app(Schedule::class));

// The safety net for draw results held for the live reveal (DrawResults::HOLD_MAX_MINUTES).
Scheduler::command('competitions:publish-draw-results')->everyMinute()->withoutOverlapping();
Scheduler::command('orders:sweep')->everyFiveMinutes()->withoutOverlapping();
Scheduler::command('players:housekeeping')->everyFifteenMinutes()->withoutOverlapping();
Scheduler::command('gimme:meta-events')->everyMinute()->withoutOverlapping();
Scheduler::command('hunts:tick')->everyFiveMinutes()->withoutOverlapping();
