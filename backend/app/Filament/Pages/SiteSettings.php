<?php

namespace App\Filament\Pages;

use App\Filament\Support\Money;
use App\Models\AdminAction;
use App\Models\Setting;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Filament\Schemas\Components\Actions;
use Filament\Schemas\Components\EmbeddedSchema;
use Filament\Schemas\Components\Form;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\Text;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;

class SiteSettings extends Page
{
    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedCog6Tooth;

    protected static ?string $navigationLabel = 'Settings';

    protected static ?string $title = 'Settings';

    protected static ?int $navigationSort = 20;

    protected static string|\UnitEnum|null $navigationGroup = 'Site';

    public ?array $data = [];

    private const MONEY = ['min_deposit_pence' => 'Minimum top up', 'min_card_pence' => 'Minimum card payment', 'min_withdrawal_pence' => 'Minimum withdrawal',
        'max_top_up_pence' => 'Largest top up'];

    private const TEXT = ['featured_slug', 'instagram_url', 'facebook_url', 'support_email', 'bonus_expiry_days', 'meta_pixel_id'];

    public function mount(): void
    {
        $data = [];
        foreach ([...array_keys(self::MONEY), ...self::TEXT] as $k) {
            $data[$k] = Setting::get($k);
        }
        $this->form->fill($data);
    }

    public function form(Schema $schema): Schema
    {
        return $schema->statePath('data')->components([
            Section::make('Money')->columns(3)->components(array_map(fn ($k) => Money::input($k, self::MONEY[$k])->required(), array_keys(self::MONEY))),
            Section::make('Bonus credit')->description('Credit you add to a player by hand, and bonus brought over from the old site.')->components([
                TextInput::make('bonus_expiry_days')->label('Bonus credit expires after (days)')->integer()->minValue(1)->maxValue(365)->required(),
            ]),
            Section::make('Site')->columns(2)->components([
                TextInput::make('featured_slug')->label('Featured competition (web address name)')->alphaDash(),
                TextInput::make('support_email')->email(),
                TextInput::make('instagram_url')->url()->prefix('https://')->rule('starts_with:https://'),
                TextInput::make('facebook_url')->url()->rule('starts_with:https://'),
                TextInput::make('meta_pixel_id')->label('Meta Pixel ID')->regex('/^\d{10,20}$/')
                    ->helperText('Numbers only, from Meta Events Manager. Leave empty for no Pixel. It only loads for visitors who accept marketing cookies.'),
            ]),
        ]);
    }

    public function content(Schema $schema): Schema
    {
        $open = Setting::bool('sales_open');

        return $schema->components([
            Section::make('Sales')->components([
                Text::make($open ? 'Sales are OPEN: players can buy, top up and enter.' : 'Sales are CLOSED: the site shows “Entries open soon”. Competitions, prizes and the free postal route stay visible.'),
                Actions::make([$this->salesAction()]),
            ]),
            Form::make([EmbeddedSchema::make('form')])->id('form')->livewireSubmitHandler('save')->footer([Actions::make([Action::make('save')->submit('save')->label('Save settings')])]),
        ]);
    }

    public function salesAction(): Action
    {
        $open = Setting::bool('sales_open');

        return Action::make('sales')->label($open ? 'Close sales' : 'Open sales')->color($open ? 'danger' : 'success')
            ->requiresConfirmation()->schema([Textarea::make('reason')->required()->maxLength(300)])
            ->action(function (array $data) use ($open) {
                Setting::put('sales_open', $open ? '0' : '1');
                AdminAction::record(auth()->user(), $open ? 'sales.closed' : 'sales.opened', null, $data['reason']);
                Notification::make()->success()->title($open ? 'Sales closed' : 'Sales open')->send();
            });
    }

    public function save(): void
    {
        $data = $this->form->getState();
        $changed = [];
        foreach ($data as $k => $v) {
            $v = is_bool($v) ? ($v ? '1' : '0') : ($v === null || $v === '' ? null : (string) $v);
            if (Setting::get($k) !== $v) {
                Setting::put($k, $v);
                $changed[$k] = $v;
            }
        }
        if ($changed) {
            AdminAction::record(auth()->user(), 'settings.saved', null, null, $changed);
        }
        Notification::make()->success()->title($changed ? 'Saved' : 'Nothing changed')->send();
    }
}
