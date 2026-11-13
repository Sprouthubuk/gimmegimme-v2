@props(['url'])
<tr>
<td class="header">
<a href="{{ $url }}" style="display: inline-block;">
{{-- PNG, not WebP: Outlook can't show WebP. --}}
<img src="{{ rtrim((string) config('app.frontend_url'), '/') }}/logo.png" class="logo" width="150" alt="Gimme Gimme Prizes">
</a>
</td>
</tr>
