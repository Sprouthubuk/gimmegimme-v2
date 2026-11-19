@props(['title', 'sub' => null, 'numbers' => []])
{{ $title }}{{ $sub ? ' — '.$sub : '' }}
{{ implode(', ', array_map(fn ($n) => '#'.$n, array_slice($numbers, 0, 60))) }}{{ count($numbers) > 60 ? ' and '.number_format(count($numbers) - 60).' more in My Tickets' : '' }}
