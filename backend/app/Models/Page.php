<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Page extends Model
{
    protected $primaryKey = 'slug';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected static function booted(): void
    {
        // Every <h2> gets an id so the page can list its sections and link to them.
        static::saving(function (Page $p) {
            $used = [];
            $p->html = preg_replace_callback('/<h2(\s[^>]*)?>(.*?)<\/h2>/s', function ($m) use (&$used) {
                $attrs = preg_replace('/\sid="[^"]*"/', '', $m[1] ?? '');
                $id = Str::slug(html_entity_decode(strip_tags($m[2]))) ?: 'section';
                $base = $id;
                for ($i = 2; isset($used[$id]); $i++) {
                    $id = $base.'-'.$i;
                }
                $used[$id] = true;

                return '<h2 id="'.$id.'"'.$attrs.'>'.$m[2].'</h2>';
            }, (string) $p->html);
        });
    }
}
