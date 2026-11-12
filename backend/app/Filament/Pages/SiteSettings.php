<?php

namespace App\Filament\Pages;

use App\Filament\Support\Money;
use App\Models\AdminAction;
use App\Models\Setting;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
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

    public ?array $data = [];

    private const MONEY = ['min_deposit_pence' => 'Minimum top up', 'min_card_pence' => 'Minimum card payment', 'min_withdrawal_pence' => 'Minimum withdrawal',
        'max_top_up_pence' => 'Largest top up', 'credit_card_monthly_cap_pence' => 'Credit cards: monthly limit per player', 'signup_bonus_cap_pence' => 'Welcome bonus: most it pays'];

    private const TEXT = ['featured_slug', 'instagram_url', 'facebook_url', 'support_email', 'bonus_expiry_days', 'signup_bonus_max_grants'];

    public function mount(): void
    {
        $data = [];
        foreach ([...array_keys(self::MONEY), ...self::TEXT, 'signup_bonus_enabled'] as $k) {
            $data[$k] = Setting::get($k);
        }
        $data['signup_bonus_enabled'] = $data['signup_bonus_enabled'] === '1';
        $this->form->fill($data);
    }

    public function form(Schema $schema): Schema
    {
        return $schema->statePath('data')->components([
            Section::make('Money')->columns(3)->components(array_map(fn ($k) => Money::input($k, self::MONEY[$k])->required(), array_keys(self::MONEY))),
            Section::make('Welcome bonus')->columns(2)->components([
                Toggle::make('signup_bonus_enabled')->label('Give a welcome bonus on the first top up'),
                TextInput::make('bonus_expiry_days')->label('Bonus expires after (days)')->integer()->minValue(1)->maxValue(365)->required(),
                TextInput::make('signup_bonus_max_grants')->label('Only for the first … players (0 = no limit)')->integer()->minValue(0)->required(),
            ]),
            Section::make('Site')->columns(2)->components([
                TextInput::make('featured_slug')->label('Featured competition (web address name)')->alphaDash(),
                TextInput::make('support_email')->email(),
                TextInput::make('instagram_url')->url()->prefix('https://')->rule('starts_with:https://'),
                TextInput::make('facebook_url')->url()->rule('starts_with:https://'),
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
