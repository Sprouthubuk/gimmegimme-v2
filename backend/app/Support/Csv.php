<?php

namespace App\Support;

use Symfony\Component\HttpFoundation\StreamedResponse;

/** CSV downloads for the admin reports. Cells a spreadsheet would run as a formula (= + - @) are made plain text. */
final class Csv
{
    public static function cell(string $v): string
    {
        return $v !== '' && in_array($v[0], ['=', '+', '-', '@', "\t", "\r"], true) ? "'".$v : $v;
    }

    /** @param list<string> $header @param iterable<list<string|int|float|null>> $rows */
    public static function download(string $name, array $header, iterable $rows): StreamedResponse
    {
        return response()->streamDownload(function () use ($header, $rows) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // so Excel reads £ correctly
            fputcsv($out, $header, escape: '');
            foreach ($rows as $r) {
                fputcsv($out, array_map(fn ($v) => is_string($v) ? self::cell($v) : $v, $r), escape: '');
            }
            fclose($out);
        }, $name, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }
}
