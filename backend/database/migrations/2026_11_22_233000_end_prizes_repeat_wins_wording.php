<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One person can now win more than one end prize (owner, 22 Nov 2026). Competition descriptions written in
 * the admin said the opposite; this rewrites only those exact sentences and leaves every other word alone.
 * Description and how-to-play are not published terms, so changing them on a live competition is allowed.
 */
return new class extends Migration
{
    public const SWAPS = [
        ', and each end prize goes to a different person.' => ', and one person can win more than one end prize.',
        'Each end prize goes to a different person.' => 'One person can win more than one end prize.',
        'each end prize goes to a different person' => 'one person can win more than one end prize',
        'One end prize per person.' => 'One person can win more than one end prize.',
    ];

    public function up(): void
    {
        foreach (DB::table('competitions')->select('id', 'description', 'how_to_play')->orderBy('id')->get() as $c) {
            $new = [];
            foreach (['description', 'how_to_play'] as $col) {
                if ($c->{$col} !== null && ($text = strtr($c->{$col}, self::SWAPS)) !== $c->{$col}) {
                    $new[$col] = $text;
                }
            }
            if ($new !== []) {
                DB::table('competitions')->where('id', $c->id)->update($new);
            }
        }
    }

    public function down(): void
    {
        // Not undone: the rule changed, so the old sentence would be wrong.
    }
};
