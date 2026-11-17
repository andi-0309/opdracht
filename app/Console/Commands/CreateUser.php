<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class CreateUser extends Command
{
    protected $signature = 'opdracht:user {email} {--name=Mein Raum} {--password=} {--reset-password : Passwort eines vorhandenen Kontos ersetzen}';

    protected $description = 'Privates Konto anlegen oder dessen Passwort zurücksetzen';

    public function handle(): int
    {
        $password = $this->option('password');
        if (! $password) {
            if (! $this->input->isInteractive()) {
                $this->error('Ein Passwort ist erforderlich. Interaktiv ausführen.');

                return self::FAILURE;
            }
            $password = $this->secret('Passwort (mindestens 12 Zeichen)');
            if ($password !== $this->secret('Passwort wiederholen')) {
                $this->error('Passwörter stimmen nicht überein.');

                return self::FAILURE;
            }
        }
        $data = ['email' => strtolower($this->argument('email')), 'name' => $this->option('name'), 'password' => $password];
        $validator = Validator::make($data, ['email' => ['required', 'email', 'max:255'], 'name' => ['required', 'string', 'max:100'], 'password' => ['required', 'string', 'min:12', 'max:255']]);
        if ($validator->fails()) {
            $this->error($validator->errors()->first());

            return self::FAILURE;
        }
        $existing = User::where('email', $data['email'])->first();
        if ($existing && ! $this->option('reset-password')) {
            $this->error('Konto existiert. Zum Zurücksetzen --reset-password verwenden.');

            return self::FAILURE;
        }
        if ($existing) {
            $existing->update(['password' => $password, 'remember_token' => null]);
            DB::table('sessions')->where('user_id', $existing->id)->delete();
        } else {
            User::create($data);
        }
        $this->info('Konto gespeichert. Du kannst dich jetzt anmelden.');

        return self::SUCCESS;
    }
}
