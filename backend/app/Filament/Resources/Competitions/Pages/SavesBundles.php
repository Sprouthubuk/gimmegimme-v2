<?php

namespace App\Filament\Resources\Competitions\Pages;

use App\Models\AdminAction;
use App\Models\Competition;

/** The competition form's bundle choices live in competition_bundle_tier, not on the competition row. */
trait SavesBundles
{
    /** @var array{ids: list<int>, featured: int|null}|null */
    private ?array $bundleChoice = null;

    protected function bundleFormData(Competition $c): array
    {
        $tiers = $c->bundleTiers()->get();

        return ['bundle_tier_ids' => $tiers->pluck('id')->map(fn ($id) => (string) $id)->all(),
            'featured_bundle_tier_id' => $tiers->firstWhere('pivot.is_featured', true)?->id];
    }

    protected function takeBundleData(array $data): array
    {
        $ids = array_values(array_unique(array_map('intval', (array) ($data['bundle_tier_ids'] ?? []))));
        $featured = isset($data['featured_bundle_tier_id']) && in_array((int) $data['featured_bundle_tier_id'], $ids, true) ? (int) $data['featured_bundle_tier_id'] : null;
        $this->bundleChoice = ['ids' => $ids, 'featured' => $featured];
        unset($data['bundle_tier_ids'], $data['featured_bundle_tier_id']);

        return $data;
    }

    protected function saveBundles(Competition $c): void
    {
        if ($this->bundleChoice === null) {
            return;
        }
        $before = $this->bundleFormData($c);
        $c->bundleTiers()->sync(collect($this->bundleChoice['ids'])->mapWithKeys(fn (int $id) => [$id => ['is_featured' => $id === $this->bundleChoice['featured']]])->all());
        $after = $this->bundleFormData($c->refresh());
        if ($before != $after && $c->verity_ref !== null) {
            AdminAction::record(auth()->user(), 'competition.bundles_changed', $c->id, 'Bundles changed while on sale', ['before' => $before, 'after' => $after]);
        }
    }
}
