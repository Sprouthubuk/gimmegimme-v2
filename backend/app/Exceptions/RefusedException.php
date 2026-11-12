<?php

namespace App\Exceptions;

/**
 * A request the rules refuse. The message is safe to show a player; the code is a stable reason
 * the front end can switch on (e.g. "self_excluded", "not_enough_wallet").
 */
class RefusedException extends \RuntimeException
{
    public function __construct(string $message, public readonly string $reason = 'refused', public readonly int $status = 422, public readonly array $fields = [])
    {
        parent::__construct($message);
    }
}
