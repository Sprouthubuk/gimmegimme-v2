@php($site = rtrim((string) config('app.frontend_url'), '/'))
<x-mail::layout>
{{-- Header --}}
<x-slot:header>
<x-mail::header :url="$site">
{{ config('app.name') }}
</x-mail::header>
</x-slot:header>

{{-- Body --}}
{!! $slot !!}

{{-- Subcopy --}}
@isset($subcopy)
<x-slot:subcopy>
<x-mail::subcopy>
{!! $subcopy !!}
</x-mail::subcopy>
</x-slot:subcopy>
@endisset

{{-- Footer --}}
<x-slot:footer>
<x-mail::footer>
**Gimme Gimme Prizes** · Tiny tickets, ginormous prizes.

18+ UK only. Free postal entry on every competition. Please play responsibly: set limits or take a break any time in [Safer Play]({{ $site }}/account/safer-play).

[{{ parse_url($site, PHP_URL_HOST) ?: $site }}]({{ $site }}) · [Help]({{ $site }}/contact)
</x-mail::footer>
</x-slot:footer>
</x-mail::layout>
