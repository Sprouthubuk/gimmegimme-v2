@props(['rows' => [], 'totalLabel' => null, 'totalValue' => null])
<table class="gg-rows" width="100%" cellpadding="0" cellspacing="0" role="presentation">
@foreach ($rows as [$label, $value])
<tr><td>{{ $label }}</td><td class="gg-val" align="right">{{ $value }}</td></tr>
@endforeach
@if ($totalLabel !== null)
<tr class="gg-total"><td>{{ $totalLabel }}</td><td class="gg-val" align="right">{{ $totalValue }}</td></tr>
@endif
</table>
