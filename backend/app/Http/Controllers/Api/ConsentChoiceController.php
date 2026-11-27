<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ConsentChoices;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/** The cookie banner reports a choice once it is made: counted as a daily total, nothing else kept or set. */
class ConsentChoiceController extends Controller
{
    public function __invoke(Request $r): Response
    {
        $d = $r->validate(['choice' => ['required', 'string', Rule::in(ConsentChoices::CHOICES)]]);
        ConsentChoices::record($d['choice']);

        return response()->noContent();
    }
}
