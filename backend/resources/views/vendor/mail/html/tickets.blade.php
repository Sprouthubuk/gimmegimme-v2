@props(['title', 'sub' => null, 'numbers' => []])
@php($shown = array_slice($numbers, 0, 60))
<table class="gg-tickets" width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#1a1322">
<tr>
<td>
<p class="gg-tickets-title">{{ $title }}</p>
@if ($sub)
<p class="gg-tickets-sub">{{ $sub }}</p>
@endif
@foreach ($shown as $n)<span class="gg-chip">#{{ $n }}</span> @endforeach
@if (count($numbers) > count($shown))
<span class="gg-more">and {{ number_format(count($numbers) - count($shown)) }} more in My Tickets</span>
@endif
</td>
</tr>
</table>
