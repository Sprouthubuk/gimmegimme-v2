<?php

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Schedule as Scheduler;
use Sprouthub\Verity\Facades\Verity;

// Verity: publish, close, draw (on drand), redraws, audit chain checks and anchors.
Verity::schedule(app(Schedule::class));

Scheduler::command('orders:sweep')->everyFiveMinutes()->withoutOverlapping();
Scheduler::command('players:housekeeping')->everyFifteenMinutes()->withoutOverlapping();
