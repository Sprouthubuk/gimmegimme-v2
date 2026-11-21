<?php

namespace App\Tracking;

use App\Models\MetaEvent;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Meta Conversions API: the server tells Meta about a sale, a top up or a sign-up, so a buyer who pays on the
 * Cashflows page and never comes back (or blocks the pixel) is still counted.
 *
 * - Only for a visitor who pressed "Accept" in the cookie banner (the `gg_consent` cookie), and only when a
 *   Pixel ID is set in the admin. Nothing is kept or sent otherwise.
 * - Each event carries the same id as the browser pixel's (the order number, or reg-{user id}), so Meta
 *   counts it once.
 * - Purchase value is real money only: card, deposit and winnings, never bonus credit.
 * - Personal details leave only as SHA-256 hashes, as Meta requires. They are read from the account when the
 *   event is sent, never stored in the event row.
 * - Sent by `gimme:meta-events` every minute; a failure is retried, and Meta only takes events up to 7 days old.
 */
final class MetaEvents
{
    public const CONSENT_COOKIE = 'gg_consent';

    private const MAX_AGE_DAYS = 7;

    private const MAX_ATTEMPTS = 5;

    public static function pixelId(): ?string
    {
        $id = (string) Setting::get('meta_pixel_id');

        return preg_match('/^\d{10,20}$/', $id) ? $id : null;
    }

    public static function consented(Request $r): bool
    {
        return $r->cookie(self::CONSENT_COOKIE) === 'accepted';
    }

    /** Keep what's needed to send this event later. Does nothing without consent or a Pixel ID. */
    public function remember(Request $r, User $user, string $name, string $eventId, ?Order $order = null): ?MetaEvent
    {
        if (! self::consented($r) || ! self::pixelId()) {
            return null;
        }
        $fbp = (string) $r->cookie('_fbp');
        $fbc = (string) $r->cookie('_fbc');

        // Tracking never gets in the way of a purchase.
        try {
            return $this->store($r, $user, $name, $eventId, $order, $fbp, $fbc);
        } catch (\Throwable $e) {
            Log::warning('Meta event not kept', ['event' => $name]);

            return null;
        }
    }

    private function store(Request $r, User $user, string $name, string $eventId, ?Order $order, string $fbp, string $fbc): MetaEvent
    {
        return MetaEvent::query()->firstOrCreate(['event_name' => $name, 'event_id' => $eventId], [
            'user_id' => $user->id,
            'order_id' => $order?->id,
            'status' => $order && $order->status !== 'paid' ? 'waiting' : 'ready',
            'context' => array_filter([
                'fbp' => preg_match('/^fb\.\d\.\d{10,16}\.\d{1,25}$/', $fbp) ? $fbp : null,
                'fbc' => preg_match('/^fb\.\d\.\d{10,16}\.[A-Za-z0-9_-]{10,500}$/', $fbc) ? $fbc : null,
                'ip' => $r->ip(),
                'ua' => mb_substr((string) $r->userAgent(), 0, 400) ?: null,
            ]),
        ]);
    }

    /**
     * Send what's due. Returns how many Meta accepted.
     */
    public function sendDue(): int
    {
        $cutoff = now()->subDays(self::MAX_AGE_DAYS)->addHour();
        // An order that was paid is ready; one that never was, after 7 days, is too old to send.
        MetaEvent::query()->where('status', 'waiting')->whereHas('order', fn ($q) => $q->where('status', 'paid'))->update(['status' => 'ready']);
        MetaEvent::query()->whereIn('status', ['waiting', 'ready', 'failed'])->where('created_at', '<', $cutoff)->update(['status' => 'expired']);

        $pixel = self::pixelId();
        $token = (string) config('services.meta.capi_token');
        if (! $pixel || $token === '') {
            return 0;
        }

        $sent = 0;
        MetaEvent::query()->whereIn('status', ['ready', 'failed'])->where('attempts', '<', self::MAX_ATTEMPTS)
            ->with(['user', 'order.lines.competition'])->orderBy('id')->chunkById(200, function ($rows) use ($pixel, $token, &$sent) {
                $data = [];
                $batch = [];
                foreach ($rows as $row) {
                    $event = $this->payload($row);
                    if ($event === null) {
                        $row->forceFill(['status' => 'skipped'])->save();

                        continue;
                    }
                    $data[] = $event;
                    $batch[] = $row;
                }
                if ($data) {
                    $sent += $this->post($pixel, $token, $data, $batch);
                }
            });

        return $sent;
    }

    /** One event as Meta wants it, or null when there's nothing to send (refunded, or no real money paid). */
    public function payload(MetaEvent $row): ?array
    {
        $user = $row->user;
        $order = $row->order;
        $site = rtrim((string) config('app.frontend_url'), '/');
        $ctx = $row->context ?? [];
        $custom = [];
        $time = $row->created_at;

        if ($row->event_name === 'Purchase' || $row->event_name === 'Deposit') {
            if (! $order || $order->status !== 'paid') {
                return null;
            }
            $time = $order->paid_at ?? $time;
            $value = self::realMoneyPence($order);
            if ($value <= 0) {
                return null;
            }
            $custom = ['currency' => 'GBP', 'value' => round($value / 100, 2), 'order_id' => $order->number];
            if ($row->event_name === 'Purchase') {
                $lines = $order->lines;
                $custom += [
                    'content_type' => 'product',
                    'content_ids' => $lines->map(fn ($l) => $l->competition?->slug)->filter()->unique()->values()->all(),
                    'contents' => $lines->filter(fn ($l) => $l->competition)->map(fn ($l) => ['id' => $l->competition->slug, 'quantity' => (int) $l->quantity])->values()->all(),
                    'num_items' => (int) $lines->sum('quantity'),
                ];
            }
        }
        if ($time->lt(now()->subDays(self::MAX_AGE_DAYS))) {
            return null;
        }

        return [
            'event_name' => $row->event_name,
            'event_time' => $time->getTimestamp(),
            'event_id' => $row->event_id,
            'action_source' => 'website',
            'event_source_url' => $site.match ($row->event_name) {
                'Purchase' => '/order/'.($order?->number ?? ''),
                'Deposit' => '/account/wallet',
                default => '/join',
            },
            'user_data' => array_filter(self::userData($user) + [
                'client_ip_address' => $ctx['ip'] ?? null,
                'client_user_agent' => $ctx['ua'] ?? null,
                'fbp' => $ctx['fbp'] ?? null,
                'fbc' => $ctx['fbc'] ?? null,
            ]),
            'custom_data' => $custom ?: null,
        ];
    }

    /** What the player paid in real money: everything except bonus credit. The browser's value is the same. */
    public static function realMoneyPence(Order $order): int
    {
        return max(0, (int) $order->total_pence - (int) $order->paid_bonus_pence);
    }

    /** The same hashed id the browser pixel sends, so Meta can tie the two together. */
    public static function externalId(User $user): string
    {
        return hash('sha256', (string) $user->id);
    }

    public static function hashedEmail(User $user): string
    {
        return hash('sha256', mb_strtolower(trim((string) $user->email)));
    }

    /**
     * Customer details, normalised as Meta's customer information parameters ask, then hashed.
     *
     * @return array<string, string>
     */
    public static function userData(User $user): array
    {
        $h = fn (?string $v) => $v === null || $v === '' ? null : hash('sha256', $v);
        $letters = fn (?string $v) => $v === null ? null : (preg_replace('/[^\p{L}]/u', '', mb_strtolower(trim($v))) ?: null);
        $phone = preg_replace('/\D/', '', (string) $user->phone);
        if (str_starts_with($phone, '00')) {
            $phone = substr($phone, 2);
        } elseif (str_starts_with($phone, '0')) {
            $phone = '44'.substr($phone, 1);
        }
        if (str_starts_with($phone, '440')) { // "+44 (0)7700 …"
            $phone = '44'.substr($phone, 3);
        }
        // UK postcodes: the area, district and sector ("SW1A 1AA" → "sw1a1"), lower case, no spaces.
        $postcode = strtolower(preg_replace('/\s+/', '', (string) $user->postcode));
        $postcode = strlen($postcode) >= 5 ? substr($postcode, 0, -2) : null;

        return array_filter([
            'em' => [self::hashedEmail($user)],
            'ph' => strlen($phone) >= 10 ? [$h($phone)] : null,
            'fn' => [$h($letters($user->first_name))],
            'ln' => [$h($letters($user->last_name))],
            'db' => $user->date_of_birth ? [$h($user->date_of_birth->format('Ymd'))] : null,
            'ct' => $user->city ? [$h($letters($user->city))] : null,
            'zp' => $postcode ? [$h($postcode)] : null,
            'country' => [$h('gb')],
            'external_id' => [self::externalId($user)],
        ], fn ($v) => $v !== null && $v !== [null]);
    }

    /** @param  array<int, array>  $data  @param  array<int, MetaEvent>  $rows */
    private function post(string $pixel, string $token, array $data, array $rows): int
    {
        $body = ['data' => $data];
        $test = (string) Setting::get('meta_test_event_code');
        if (preg_match('/^[A-Za-z0-9]{4,20}$/', $test)) {
            $body['test_event_code'] = $test;
        }
        $version = (string) config('services.meta.graph_version');
        try {
            $res = Http::timeout(15)->asJson()->withQueryParameters(['access_token' => $token])
                ->post("https://graph.facebook.com/{$version}/{$pixel}/events", $body);
            $ok = $res->successful();
            // Meta's error type and code only: never the message body, which can repeat what was sent.
            $error = $ok ? null : mb_substr('HTTP '.$res->status().' '.($res->json('error.type') ?? '').' '.($res->json('error.code') ?? ''), 0, 200);
        } catch (\Throwable $e) {
            $ok = false;
            $error = 'Could not reach Meta';
        }
        foreach ($rows as $row) {
            $row->forceFill($ok
                ? ['status' => 'sent', 'sent_at' => now(), 'last_error' => null, 'attempts' => $row->attempts + 1]
                : ['status' => 'failed', 'last_error' => $error, 'attempts' => $row->attempts + 1])->save();
        }
        if (! $ok) {
            Log::warning('Meta events not accepted', ['count' => count($rows), 'error' => $error]);
        }

        return $ok ? count($rows) : 0;
    }
}
