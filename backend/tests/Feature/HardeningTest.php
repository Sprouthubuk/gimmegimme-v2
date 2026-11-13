<?php

namespace Tests\Feature;

use App\Models\Page;
use App\Support\PictureSizes;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Speed and safety fixes from the 13 November audit. */
class HardeningTest extends TestCase
{
    private function jpeg(int $w = 1254, int $h = 1254): string
    {
        $im = imagecreatetruecolor($w, $h);
        imagefill($im, 0, 0, imagecolorallocate($im, 255, 31, 160));
        ob_start();
        imagejpeg($im, null, 90);

        return (string) ob_get_clean();
    }

    public function test_saving_a_picture_makes_small_webp_copies_and_the_api_offers_them(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('competitions/big.jpg', $this->jpeg());
        $c = $this->competition('instant');
        $c->forceFill(['image' => 'competitions/big.jpg'])->save();

        foreach (PictureSizes::WIDTHS as $w) {
            $path = PictureSizes::path('competitions/big.jpg', $w);
            Storage::disk('public')->assertExists($path);
            $size = getimagesizefromstring(Storage::disk('public')->get($path));
            $this->assertSame($w, $size[0]);
            $this->assertSame('image/webp', $size['mime']);
        }

        $this->getJson('/api/competitions/'.$c->slug)->assertOk()
            ->assertJsonPath('image', '/storage/competitions/big.jpg')
            ->assertJsonPath('imageSmall', '/storage/variants/competitions/big-400.webp')
            ->assertJsonPath('imageSrcset', '/storage/variants/competitions/big-400.webp 400w, /storage/variants/competitions/big-800.webp 800w, /storage/variants/competitions/big-1200.webp 1200w');
    }

    public function test_a_picture_without_copies_still_works(): void
    {
        $c = $this->competition('instant');

        $r = $this->getJson('/api/competitions/'.$c->slug)->assertOk();
        $this->assertSame($r->json('image'), $r->json('imageSmall'));
        $this->assertNull($r->json('imageSrcset'));
    }

    public function test_the_command_fills_in_missing_copies(): void
    {
        Storage::fake('public');
        $c = $this->competition('instant');
        Storage::disk('public')->put('competitions/late.png', $this->jpeg(600, 600));
        $c->forceFill(['image' => 'competitions/late.png'])->saveQuietly();
        $this->assertSame([], PictureSizes::existing('competitions/late.png'));

        $this->artisan('gimme:picture-sizes')->assertSuccessful();
        $this->assertCount(3, PictureSizes::existing('competitions/late.png'));
        // Never wider than the upload: a 600px picture's "1200" copy is 600px.
        $this->assertSame(600, getimagesizefromstring(Storage::disk('public')->get(PictureSizes::path('competitions/late.png', 1200)))[0]);
    }

    public function test_legal_page_wording_keeps_formatting_but_never_a_script(): void
    {
        $p = Page::query()->updateOrCreate(['slug' => 'terms'], ['title' => 'Terms', 'version' => 1,
            'html' => '<h2 onclick="steal()">Your Account</h2><p>See <a href="javascript:alert(1)">this</a> and <a href="/faq">the FAQ</a>.<script>alert(1)</script><img src="x" onerror="alert(1)"></p><iframe src="https://example.com"></iframe>']);

        $html = $p->refresh()->html;
        $this->assertStringContainsString('<h2 id="your-account">Your Account</h2>', $html);
        $this->assertStringContainsString('<a href="/faq">the FAQ</a>', $html);
        foreach (['onclick', 'javascript:', '<script', 'onerror', '<iframe', 'alert('] as $bad) {
            $this->assertStringNotContainsString($bad, $html);
        }
    }

    public function test_a_missing_competition_does_not_name_internal_classes(): void
    {
        $this->getJson('/api/competitions/no-such-competition')->assertNotFound()->assertExactJson(['message' => 'Not found.']);
    }
}
