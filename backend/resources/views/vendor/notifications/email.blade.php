{{--
  Every notification email (Laravel's template, in Gimme Gimme's words and design). A notification can add
  blocks with ->markdown('notifications::email', ['blocks' => [...]]): ['tickets', title, sub, numbers] or
  ['rows', [[label, value], ...], totalLabel?, totalValue?]. They sit between the intro and the button.
--}}
<x-mail::message>
{{-- Greeting --}}
@if (! empty($greeting))
# {{ $greeting }}
@else
# Hi there,
@endif

{{-- Intro Lines --}}
@foreach ($introLines as $line)
{{ $line }}

@endforeach

{{-- Blocks --}}
@foreach ($blocks ?? [] as $b)
@if ($b[0] === 'tickets')
<x-mail::tickets :title="$b[1]" :sub="$b[2]" :numbers="$b[3]" />
@elseif ($b[0] === 'rows')
<x-mail::rows :rows="$b[1]" :total-label="$b[2] ?? null" :total-value="$b[3] ?? null" />
@endif

@endforeach

{{-- Action Button --}}
@isset($actionText)
<x-mail::button :url="$actionUrl" :color="$level === 'error' ? 'error' : 'primary'">
{{ $actionText }}
</x-mail::button>
@endisset

{{-- Outro Lines --}}
@foreach ($outroLines as $line)
{{ $line }}

@endforeach

{{-- Salutation --}}
@if (! empty($salutation))
{{ $salutation }}
@else
The Gimme Gimme team
@endif

{{-- Subcopy --}}
@isset($actionText)
<x-slot:subcopy>
Button not working? Copy this link into your browser: <span class="break-all">[{{ $displayableActionUrl }}]({{ $actionUrl }})</span>
</x-slot:subcopy>
@endisset
</x-mail::message>
