<?php

namespace Tests\Feature;

use App\Filament\Pages\CompetitionReport;
use App\Filament\Pages\MoneyReport;
use App\Filament\Pages\SiteSettings;
use App\Filament\Pages\WinsReport;
use App\Filament\Resources\Users\Pages\ListUsers;
use App\Filament\Resources\Users\Pages\ViewUser;
use App\Filament\Support\Daily;
use App\Filament\Widgets\BigWins;
use App\Filament\Widgets\MoneyStats;
use App\Filament\Widgets\Overview;
use App\Filament\Widgets\SalesChart;
use App\Filament\Widgets\TopBuyers;
use App\Models\Competition;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\AdminAlert;
use App\Services\Bundles;
use App\Services\Fulfilment;
use App\Services\Orders;
use App\Support\Reports;
use Filament\Auth\MultiFactor\App\AppAuthentication;
use Filament\Facades\Filament;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Livewire\Livewire;
use Sprouthub\Verity\Models\Winner;
use Tests\TestCase;

/** The admin's reports: player page, players list, wins, big-win alerts, money and competitions. Read only. */
class AdminReportsTest extends TestCase
{
    private function signInAdmin(): User
    {
        $a = $this->admin();
        $a->saveAppAuthenticationSecret(app(AppAuthentication::class)->generateSecret()); // two-step sign-in set up
        $a->refresh();
        $this->actingAs($a, 'web'); // the checkout calls leave the API's guard as the default
        Filament::setCurrentPanel('admin');

        return $a;
    }

    private function buy(User $u, Competition $c, int $quantity)
    {
        $r = $this->actingAs($u)->postJson('/api/checkout', [
            'lines' => [['competitionId' => $c->id, 'quantity' => $quantity]], 'payWith' => 'wallet', 'useWallet' => true, 'requestId' => (string) Str::uuid(),
        ]);

        return $r->assertCreated();
    }

    /** An instant game where every ticket wins $pence. */
    private function everyTicketWins(int $pence, int $tickets = 20): Competition
    {
        return $this->competition('instant', ['max_tickets' => $tickets, 'max_per_person' => $tickets, 'price_pence' => 100], [['Prize '.$pence, $pence, $tickets, 'site_credit']]);
    }

    public function test_a_big_win_emails_the_team_once_and_small_wins_dont(): void
    {
        Notification::fake();
        config(['app.alert_emails' => 'ops@example.com']);
        $u = $this->player(['first_name' => 'Abbie', 'last_name' => 'Fox']);
        $this->topUp($u, 10000);

        $this->buy($u, $this->everyTicketWins(50), 2); // 50p wins: not big
        Notification::assertSentOnDemandTimes(AdminAlert::class, 0);

        $big = $this->everyTicketWins(15000);
        $this->buy($u, $big, 1); // £150: big (default line £100)
        Notification::assertSentOnDemandTimes(AdminAlert::class, 1);
        Notification::assertSentOnDemand(AdminAlert::class, fn (AdminAlert $n, array $channels, object $to) => str_contains($n->subject, 'Big Win: £150.00')
            && str_contains(implode(' ', $n->lines), 'Abbie Fox') && $to->routes['mail'] === ['ops@example.com'] && $n->path === '/admin/users/'.$u->id);

        // Paying the same win again (a retry) sends nothing more.
        $w = Winner::query()->where('owner_ref', 'user:'.$u->id)->where('prize_value_pence', 15000)->firstOrFail();
        app(Fulfilment::class)->awardInstantWin($w);
        Notification::assertSentOnDemandTimes(AdminAlert::class, 1);
    }

    public function test_the_big_win_line_and_who_is_told_come_from_settings(): void
    {
        Notification::fake();
        Setting::put('big_win_alert_pence', '500');
        Setting::put('big_win_alert_emails', 'liam@example.com, simon@example.com');
        $u = $this->player();
        $this->topUp($u, 5000);
        $this->buy($u, $this->everyTicketWins(600), 1);
        Notification::assertSentOnDemand(AdminAlert::class, fn ($n, $c, $to) => $to->routes['mail'] === ['liam@example.com', 'simon@example.com']);

        $this->signInAdmin();
        Livewire::test(SiteSettings::class)->fillForm(['big_win_alert_pence' => '250.00'])->call('save')->assertHasNoFormErrors();
        $this->assertSame(25000, Reports::bigWinPence());
    }

    public function test_the_player_page_shows_balances_entries_wins_orders_and_history(): void
    {
        $u = $this->player(['first_name' => 'Jamie', 'last_name' => 'Dee']);
        $this->topUp($u, 3000);
        $this->topUp($u, 700, 'bonus');
        $c = $this->everyTicketWins(250);
        $this->buy($u, $c, 3); // £3 from the wallet, 3 × £2.50 won
        $draw = $this->competition('draw', ['price_pence' => 50]);
        $this->buy($u, $draw, 4);
        $order = Order::query()->where('user_id', $u->id)->where('order_type', 'tickets')->latest()->firstOrFail();

        $money = Reports::playerMoney($u);
        $this->assertSame(750, $money['winnings']);
        $this->assertSame(750, $money['won']);
        $this->assertSame(500, $money['walletOnTickets']);

        $this->signInAdmin();
        Livewire::test(ViewUser::class, ['record' => $u->getKey()])->assertOk()
            ->assertSee('Jamie Dee')->assertSee('£7.50')            // winnings and won
            ->assertSee($c->title)->assertSee($draw->title)          // competitions entered
            ->assertSee('Prize 250')->assertSee($order->number)      // a win and an order
            ->assertSee('Test top up')->assertSee('Safer Play');     // wallet history and safer play
        $entries = collect(Reports::playerEntries($u))->keyBy('title');
        $this->assertSame([3, 4], [$entries[$c->title]['tickets'], $entries[$draw->title]['tickets']]);
        $this->assertCount(4, $entries[$draw->title]['numbers']); // the ticket numbers themselves
    }

    public function test_the_players_list_shows_and_filters_by_winnings_and_spend(): void
    {
        $winner = $this->player();
        $this->topUp($winner, 2000);
        $this->buy($winner, $this->everyTicketWins(1000), 1); // £10 winnings
        $quiet = $this->player();
        $this->topUp($quiet, 500);

        $admin = $this->signInAdmin();
        Livewire::test(ListUsers::class)
            ->assertCanSeeTableRecords([$winner, $quiet])
            ->sortTable('winnings_pence', 'desc')->assertCanSeeTableRecords([$winner, $quiet], inOrder: true)
            ->filterTable('winnings', ['min' => 5])->assertCanSeeTableRecords([$winner])->assertCanNotSeeTableRecords([$quiet]);
        $this->actingAs($admin, 'web')->get('/admin/users/'.$winner->id)->assertOk()->assertSee('Winnings (withdrawable)');
    }

    public function test_the_wins_report_lists_filters_and_downloads(): void
    {
        $u = $this->player(['first_name' => 'Kim', 'last_name' => 'Sun']);
        $this->topUp($u, 30000);
        $this->buy($u, $this->everyTicketWins(20000), 1);
        $this->buy($u, $this->everyTicketWins(100), 1);

        $this->signInAdmin();
        $big = Winner::query()->where('prize_value_pence', 20000)->firstOrFail();
        $small = Winner::query()->where('prize_value_pence', 100)->firstOrFail();
        Livewire::test(WinsReport::class)->assertOk()
            ->assertCanSeeTableRecords([$big, $small])
            ->filterTable('big')->assertCanSeeTableRecords([$big])->assertCanNotSeeTableRecords([$small])
            ->callTableAction('csv')->assertFileDownloaded('wins-'.now('Europe/London')->format('Y-m-d').'.csv');
        $this->assertSame(1, Reports::bigWins(now()->subDay())->count());
    }

    public function test_the_money_report_adds_up(): void
    {
        $a = $this->player();
        $this->topUp($a, 4000);
        $this->buy($a, $this->everyTicketWins(300), 2); // spends £2, wins £6
        $b = $this->player();
        $this->topUp($b, 1000, 'bonus');

        $o = Reports::owed();
        $this->assertSame([600, 3800, 1000, 1], [$o['winnings'], $o['deposit'], $o['bonus'], $o['playersWithWinnings']]);
        $today = Reports::daily(1)[now('Europe/London')->format('Y-m-d')];
        $this->assertSame([200, 600, 1], [$today['walletSpend'], $today['winningsCredited'], $today['orders']]);

        $admin = $this->signInAdmin();
        Livewire::test(MoneyReport::class)->assertOk()->assertSee('£6.00')->assertSee('Winnings (owed)')
            ->callAction('csv')->assertFileDownloaded('money-'.now('Europe/London')->format('Y-m-d').'.csv');
        $this->actingAs($admin, 'web')->get('/admin')->assertOk();
        Livewire::test(MoneyStats::class)->assertSee('Winnings Owed')->assertSee('£6.00')->assertSee('Big Wins Today');
        Livewire::test(TopBuyers::class)->assertSee('Top Buyers Today')->assertSee($a->email)->assertSee('£2.00');
        Livewire::test(BigWins::class)->assertSee('No big wins in the last 7 days');
        foreach (['wins-report', 'money-report', 'competition-report'] as $page) {
            $this->get('/admin/'.$page)->assertOk();
        }
    }

    public function test_the_competition_report_shows_takings_players_and_prizes(): void
    {
        $c = $this->everyTicketWins(80);
        foreach ([2, 3] as $n) {
            $u = $this->player();
            $this->topUp($u, 1000);
            $this->buy($u, $c, $n);
        }
        $row = Reports::competitionsQuery()->whereKey($c->id)->firstOrFail();
        $this->assertSame([500, 2, 400, 5], [(int) $row->revenue_pence, (int) $row->buyers, (int) $row->won_pence, (int) $row->tickets_sold]);
        $this->assertSame(3, (int) Reports::competitionTopBuyers($c)->first()->tickets);

        $this->signInAdmin();
        Livewire::test(CompetitionReport::class)->assertOk()->assertCanSeeTableRecords([$c])
            ->assertSee('£5.00')->assertSee('£1.00') // takings, takings less prizes won
            ->callTableAction('csv')->assertFileDownloaded('competitions-'.now('Europe/London')->format('Y-m-d').'.csv');
    }

    public function test_the_dashboard_shows_card_money_in_not_the_value_of_tickets(): void
    {
        // Owner, 25 Nov 2026: the dashboard's money is what Cashflows pays out, not tickets bought from balances.
        $orders = app(Orders::class);
        $c = $this->competition('draw', ['price_pence' => 25, 'max_tickets' => 1000, 'max_per_person' => 1000]);
        $a = $this->player();
        $this->topUp($a, 500); // credit already in the wallet: buying with it brings no new money in
        $orders->checkout($a, [['competitionId' => $c->id, 'quantity' => 20]], 'wallet', true, null, (string) Str::uuid());
        $b = $this->player();
        $this->topUp($b, 100);
        $r = $orders->checkout($b, [['competitionId' => $c->id, 'quantity' => 20]], 'card', true, null, (string) Str::uuid()); // £5: £1 wallet + £4 card
        $this->gateway()->settle($r['order']->gateway_ref, 'paid');
        $orders->syncWithGateway($r['order']);

        $today = collect(Daily::cardIn(1))->last();
        $this->assertSame(400, $today['pence'], 'only the card part is money in');
        $this->assertSame(Bundles::cardFee(400), $today['fees']);
        $this->assertSame(21, Bundles::cardFee(400)); // 1.6% + 15p
        $this->assertSame(1000, (int) collect(Daily::takings(1))->last(), 'tickets bought, all ways of paying');

        $this->actingAs($this->admin());
        Filament::setCurrentPanel('admin');
        Livewire::test(Overview::class)->assertSee('Card Money In Today')->assertSee('£4.00')->assertSee('£3.79 after Cashflows fees')
            ->assertSee('£10.00 of tickets bought today')->assertDontSee('Ticket Sales Today');
        Livewire::test(SalesChart::class)->assertSee('Card Money In, Last 30 Days');
    }
}
