<?php

namespace App\Payments;

use App\Models\Order;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Cashflows hosted payment page. Every request carries ConfigurationId and Hash = SHA-512(apiKey + body).
 * The job reference goes into an address only after it is checked to be letters, digits and hyphens.
 */
final class CashflowsGateway implements PaymentGateway
{
    public function __construct(private string $baseUrl, private string $configurationId, private string $apiKey) {}

    public function createPaymentJob(Order $order, string $email, array $returnUrls): array
    {
        $body = json_encode([
            'type' => 'Payment',
            'amountToCollect' => number_format($order->card_pence / 100, 2, '.', ''),
            'currency' => 'GBP',
            'locale' => 'en_GB',
            'order' => ['orderNumber' => $order->number, 'billingIdentity' => ['emailAddress' => $email]],
            'parameters' => [
                'returnUrlSuccess' => $returnUrls['success'],
                'returnUrlFailed' => $returnUrls['failed'],
                'returnUrlCancelled' => $returnUrls['cancelled'],
            ],
        ], JSON_UNESCAPED_SLASHES);
        $res = Http::timeout(15)->withHeaders($this->headers($body))->withBody($body, 'application/json')
            ->post($this->baseUrl.'/api/gateway/payment-jobs');
        $data = $res->json('data') ?? $res->json() ?? [];
        $ref = $data['reference'] ?? null;
        $url = $data['links']['action']['url'] ?? $res->json('links.action.url');
        if (! $res->successful() || ! GatewayAnswer::isReference($ref) || ! is_string($url) || ! str_starts_with($url, 'https://')) {
            Log::warning('Cashflows did not create a payment job', ['order' => $order->number, 'status' => $res->status()]);
            throw new \RuntimeException('The payment page could not be opened.');
        }

        return ['reference' => $ref, 'redirectUrl' => $url];
    }

    public function lookup(string $jobReference): ?GatewayAnswer
    {
        if (! GatewayAnswer::isReference($jobReference)) {
            return null;
        }
        try {
            $res = Http::timeout(10)->withHeaders($this->headers(''))->get($this->baseUrl.'/api/gateway/payment-jobs/'.rawurlencode($jobReference));
        } catch (\Throwable $e) {
            Log::warning('Cashflows lookup failed', ['job' => $jobReference]);

            return null;
        }
        if (! $res->successful()) {
            Log::warning('Cashflows lookup refused', ['job' => $jobReference, 'status' => $res->status()]);

            return null;
        }

        return self::parse($res->json() ?? []);
    }

    /** Turn a payment-job answer into the facts we check. Public so it can be tested on sample answers. */
    public static function parse(array $body): GatewayAnswer
    {
        $inner = is_array($body['data'] ?? null) ? $body['data'] : $body;
        $payments = is_array($inner['payments'] ?? null) ? $inner['payments'] : [];
        $paid = null;
        foreach (array_reverse($payments) as $p) {
            if (in_array(strtolower((string) ($p['status'] ?? '')), ['paid', 'captured'], true)) {
                $paid = $p;
                break;
            }
        }
        $chosen = $paid ?? (end($payments) ?: null);
        $status = $paid['status'] ?? $inner['status'] ?? $inner['paymentStatus'] ?? $chosen['status'] ?? null;
        $job = $inner['paymentJobReference'] ?? $inner['reference'] ?? null;
        $number = self::find($inner, '/^ordernumber$/i');
        $amount = self::find($inner, '/^(amounttocollect|amountcollected|paidamount|amount)$/i');
        $currency = self::find($inner, '/^currency$/i');
        $funding = self::find($inner, '/(fund|cardtype|cardcategory|card_type)/i');

        return new GatewayAnswer(
            is_string($job) && $job !== '' ? $job : null,
            is_string($number) && $number !== '' ? $number : null,
            is_numeric($amount) ? (int) round(((float) $amount) * 100) : null,
            is_string($currency) ? $currency : null,
            GatewayAnswer::mapStatus(is_string($status) ? $status : null),
            is_string($funding) ? (stripos($funding, 'credit') !== false ? 'credit' : (stripos($funding, 'debit') !== false ? 'debit' : null)) : null,
        );
    }

    /** The first scalar whose key matches, nearest the top first. */
    private static function find(array $obj, string $re, int $depth = 0): mixed
    {
        if ($depth > 4) {
            return null;
        }
        foreach ($obj as $k => $v) {
            if (is_scalar($v) && is_string($k) && preg_match($re, $k)) {
                return $v;
            }
        }
        foreach ($obj as $v) {
            if (is_array($v) && ($hit = self::find($v, $re, $depth + 1)) !== null) {
                return $hit;
            }
        }

        return null;
    }

    /** A notification's Hash header, when Cashflows sends one, must be SHA-512(apiKey + body). */
    public function signatureValid(string $rawBody, string $hash): bool
    {
        return hash_equals(hash('sha512', $this->apiKey.$rawBody), strtolower(trim($hash)));
    }

    private function headers(string $body): array
    {
        return ['ConfigurationId' => $this->configurationId, 'Hash' => hash('sha512', $this->apiKey.$body), 'Accept' => 'application/json'];
    }
}
