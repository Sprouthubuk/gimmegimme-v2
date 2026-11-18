<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// A player's ID document, for admins only (the admin's ID Checks page links here). Never public.
Route::get('/admin/id-checks/{check}/{which}', function (\App\Models\IdCheck $check, string $which) {
    $user = request()->user();
    // An admin who has finished two-step sign-in (the admin makes every admin set it up before anything else).
    abort_unless($user && $user->canAccessPanel(\Filament\Facades\Filament::getPanel('admin')) && $user->getAppAuthenticationSecret(), 403);
    abort_unless(in_array($which, ['photo', 'address'], true), 404);
    $path = $which === 'photo' ? $check->photo_path : $check->address_path;
    abort_unless(\Illuminate\Support\Facades\Storage::disk('local')->exists($path), 404);
    \App\Models\AdminAction::record($user, 'id_check.viewed', (string) $check->user_id, null, ['document' => $which]);

    return \Illuminate\Support\Facades\Storage::disk('local')->response($path, null, ['Cache-Control' => 'no-store, private', 'X-Robots-Tag' => 'noindex']);
})->name('admin.id-check-file');
