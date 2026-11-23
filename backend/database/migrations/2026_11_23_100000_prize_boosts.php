<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Prize boosts (owner, 23 Nov 2026): extra instant prizes added to a live instant-win competition,
 * alongside Verity's table, never in it (Verity's table is fixed at publish and untouched).
 *
 * prize_boosts: one row per competition per batch, the audit record of how its numbers were chosen.
 * boost_prizes: one row per added prize, with its own winning ticket number.
 * Both refuse DELETE for everyone; a boost record never changes, and a prize only ever gets its winner once.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('prize_boosts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('competition_id')->constrained()->restrictOnDelete();
            $t->string('batch', 40);
            $t->string('reason', 191);
            $t->string('algorithm', 40);
            $t->string('beacon_source', 40);
            $t->unsignedBigInteger('beacon_round')->nullable();
            $t->string('beacon_randomness', 64);
            $t->text('beacon_signature')->nullable();
            $t->unsignedInteger('max_tickets');
            $t->unsignedInteger('issued_count');
            $t->string('issued_hash', 64);       // SHA-256 of the issued ticket numbers at the lock, sorted, "\n"-joined
            $t->unsignedInteger('excluded_count');
            $t->string('excluded_hash', 64);     // SHA-256 of every number left out (issued + Verity's winning numbers)
            $t->longText('excluded_numbers');    // those numbers, ascending, comma-separated: public, so anyone can re-run the choice
            $t->string('verity_table_hash', 64); // SHA-256 of Verity's prize numbers before and after: proof it was untouched
            $t->unsignedInteger('prize_count');
            $t->unsignedBigInteger('value_pence');
            $t->timestamp('added_at');
            $t->timestamps();
            $t->unique(['competition_id', 'batch']);
        });
        Schema::create('boost_prizes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('prize_boost_id')->constrained()->restrictOnDelete();
            $t->foreignId('competition_id')->constrained()->restrictOnDelete();
            $t->unsignedInteger('slot');
            $t->string('name', 120);
            $t->unsignedInteger('value_pence');
            $t->string('type', 20)->default('site_credit');
            $t->unsignedInteger('ticket_number');
            $t->timestamp('added_at');
            $t->unsignedBigInteger('won_entry_id')->nullable();
            $t->unsignedBigInteger('won_group_id')->nullable();
            $t->string('won_owner_ref', 64)->nullable();
            $t->foreignId('won_user_id')->nullable()->constrained('users')->restrictOnDelete();
            $t->timestamp('won_at')->nullable();
            $t->timestamps();
            $t->unique(['competition_id', 'ticket_number']);
            $t->unique(['prize_boost_id', 'slot']);
        });
        self::guards();
    }

    public static function guards(): void
    {
        $driver = DB::getDriverName();
        foreach (['prize_boosts', 'boost_prizes'] as $table) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$table}_no_delete");
            if ($driver === 'sqlite') {
                DB::unprepared("CREATE TRIGGER {$table}_no_delete BEFORE DELETE ON {$table} BEGIN SELECT RAISE(ABORT, '{$table} is append-only'); END");
            } elseif (in_array($driver, ['mysql', 'mariadb'], true)) {
                DB::unprepared("CREATE TRIGGER {$table}_no_delete BEFORE DELETE ON {$table} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$table} is append-only'");
            }
        }
        DB::unprepared('DROP TRIGGER IF EXISTS prize_boosts_no_update');
        DB::unprepared('DROP TRIGGER IF EXISTS boost_prizes_locked');
        if ($driver === 'sqlite') {
            DB::unprepared("CREATE TRIGGER prize_boosts_no_update BEFORE UPDATE ON prize_boosts BEGIN SELECT RAISE(ABORT, 'prize_boosts is append-only'); END");
            DB::unprepared("CREATE TRIGGER boost_prizes_locked BEFORE UPDATE ON boost_prizes
                WHEN NEW.ticket_number IS NOT OLD.ticket_number OR NEW.value_pence IS NOT OLD.value_pence OR NEW.name IS NOT OLD.name
                  OR NEW.competition_id IS NOT OLD.competition_id OR NEW.prize_boost_id IS NOT OLD.prize_boost_id OR NEW.type IS NOT OLD.type
                  OR (OLD.won_at IS NOT NULL AND (NEW.won_at IS NOT OLD.won_at OR NEW.won_entry_id IS NOT OLD.won_entry_id OR NEW.won_user_id IS NOT OLD.won_user_id OR NEW.won_owner_ref IS NOT OLD.won_owner_ref))
                BEGIN SELECT RAISE(ABORT, 'a boost prize is fixed once added, and its winner once won'); END");
        } elseif (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::unprepared("CREATE TRIGGER prize_boosts_no_update BEFORE UPDATE ON prize_boosts FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'prize_boosts is append-only'");
            DB::unprepared("CREATE TRIGGER boost_prizes_locked BEFORE UPDATE ON boost_prizes FOR EACH ROW BEGIN
                IF NOT (NEW.ticket_number <=> OLD.ticket_number) OR NOT (NEW.value_pence <=> OLD.value_pence) OR NOT (NEW.name <=> OLD.name)
                  OR NOT (NEW.competition_id <=> OLD.competition_id) OR NOT (NEW.prize_boost_id <=> OLD.prize_boost_id) OR NOT (NEW.type <=> OLD.type)
                  OR (OLD.won_at IS NOT NULL AND (NOT (NEW.won_at <=> OLD.won_at) OR NOT (NEW.won_entry_id <=> OLD.won_entry_id) OR NOT (NEW.won_user_id <=> OLD.won_user_id) OR NOT (NEW.won_owner_ref <=> OLD.won_owner_ref))) THEN
                  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'a boost prize is fixed once added, and its winner once won';
                END IF;
              END");
        }
    }

    public function down(): void
    {
        foreach (['prize_boosts_no_delete', 'boost_prizes_no_delete', 'prize_boosts_no_update', 'boost_prizes_locked'] as $t) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$t}");
        }
        Schema::dropIfExists('boost_prizes');
        Schema::dropIfExists('prize_boosts');
    }
};
