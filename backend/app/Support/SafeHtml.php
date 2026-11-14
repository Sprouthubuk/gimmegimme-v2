<?php

namespace App\Support;

/**
 * Cleans HTML written in the admin's rich editor (legal pages) before it is saved: only formatting tags
 * are kept, every on…= attribute and style is dropped, and links/images must be http(s), mailto, tel, # or
 * a path on this site. The pages are shown as HTML on the site, so this is what stops a script getting in.
 */
class SafeHtml
{
    private const TAGS = ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
        'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div', 'img', 'figure', 'figcaption'];

    private const ATTRS = ['href', 'title', 'id', 'colspan', 'rowspan', 'src', 'alt', 'width', 'height', 'target', 'rel'];

    public static function clean(string $html): string
    {
        if (trim($html) === '') {
            return '';
        }
        $doc = new \DOMDocument;
        $prev = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="utf-8"?><div id="safe-root">'.$html.'</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        libxml_use_internal_errors($prev);
        $root = $doc->getElementById('safe-root');
        if (! $root) {
            return htmlspecialchars(strip_tags($html));
        }
        self::walk($root);
        $out = '';
        foreach (iterator_to_array($root->childNodes) as $child) {
            $out .= $doc->saveHTML($child);
        }

        return $out;
    }

    private static function walk(\DOMNode $node): void
    {
        foreach (iterator_to_array($node->childNodes) as $child) {
            if ($child instanceof \DOMComment || $child instanceof \DOMProcessingInstruction) {
                $node->removeChild($child);

                continue;
            }
            if (! $child instanceof \DOMElement) {
                continue;
            }
            $tag = strtolower($child->tagName);
            if (in_array($tag, ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'template', 'link', 'meta', 'base'], true)) {
                $node->removeChild($child); // dropped with everything inside

                continue;
            }
            self::walk($child);
            if (! in_array($tag, self::TAGS, true)) {
                while ($child->firstChild) { // keep the words, lose the tag
                    $node->insertBefore($child->firstChild, $child);
                }
                $node->removeChild($child);

                continue;
            }
            foreach (iterator_to_array($child->attributes) as $attr) {
                $name = strtolower($attr->name);
                $ok = in_array($name, self::ATTRS, true)
                    && (! in_array($name, ['href', 'src'], true) || self::safeUrl($attr->value));
                if (! $ok) {
                    $child->removeAttribute($attr->name);
                }
            }
            if ($tag === 'a' && $child->getAttribute('target') === '_blank') {
                $child->setAttribute('rel', 'noopener noreferrer');
            }
        }
    }

    private static function safeUrl(string $url): bool
    {
        $u = trim(preg_replace('/[\x00-\x20]+/', '', $url) ?? '');

        return $u === '' || preg_match('#^(https?://|mailto:|tel:|\#|/(?!/))#i', $u) === 1;
    }
}
