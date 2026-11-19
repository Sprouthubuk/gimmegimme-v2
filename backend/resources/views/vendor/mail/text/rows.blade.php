@props(['rows' => [], 'totalLabel' => null, 'totalValue' => null])
@foreach ($rows as [$label, $value])
{{ $label }}: {{ $value }}
@endforeach
@if ($totalLabel !== null)
{{ $totalLabel }}: {{ $totalValue }}
@endif
