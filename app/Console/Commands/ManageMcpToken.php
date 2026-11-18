<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

class ManageMcpToken extends Command
{
    protected $signature = 'opdracht:mcp-token {email} {--name=clawy} {--write : Planer-Änderungen erlauben} {--days=30 : Gültigkeit in Tagen, maximal 365} {--list : Token-Metadaten auflisten} {--revoke= : Ein MCP-Token dieses Benutzers widerrufen}';

    protected $description = 'Benutzergebundene MCP-Tokens erstellen, auflisten oder widerrufen';

    public function handle(): int
    {
        $data = ['email' => strtolower($this->argument('email')), 'name' => $this->option('name'), 'days' => $this->option('days'), 'revoke' => $this->option('revoke')];
        $validator = Validator::make($data, [
            'email' => ['required', 'email', 'max:255'],
            'name' => ['required', 'string', 'max:80'],
            'days' => ['required', 'integer', 'min:1', 'max:365'],
            'revoke' => ['nullable', 'integer', 'min:1'],
        ]);
        if ($validator->fails()) {
            $this->error($validator->errors()->first());

            return self::FAILURE;
        }
        $user = User::where('email', $data['email'])->first();
        if (! $user) {
            $this->error('Konto nicht gefunden. Zuerst in Opdracht anmelden.');

            return self::FAILURE;
        }
        if ($this->option('list') && $data['revoke'] !== null) {
            $this->error('--list und --revoke sind nicht kombinierbar.');

            return self::FAILURE;
        }
        $tokens = $user->tokens()->where('name', 'like', 'mcp:%');
        if ($data['revoke'] !== null) {
            if (! $tokens->whereKey($data['revoke'])->delete()) {
                $this->error('MCP-Token dieses Kontos nicht gefunden.');

                return self::FAILURE;
            }
            $this->info('MCP-Token widerrufen.');

            return self::SUCCESS;
        }
        if ($this->option('list')) {
            $this->table(['ID', 'Name', 'Rechte', 'Ablauf'], $tokens->get()->map(fn ($token) => [
                $token->id, $token->name, implode(', ', $token->abilities), $token->expires_at?->toIso8601String() ?? 'Kein Ablauf',
            ])->all());

            return self::SUCCESS;
        }
        $abilities = ['planner:read'];
        if ($this->option('write')) {
            $abilities[] = 'planner:write';
        }
        $token = $user->createToken('mcp:'.$data['name'], $abilities, now()->addDays((int) $data['days']));
        $this->warn('Token wird nur einmal angezeigt. Wie ein Passwort behandeln; nicht ins Repository oder in Chats kopieren.');
        $this->line($token->plainTextToken);
        $this->info('MCP-Token erstellt. ID: '.$token->accessToken->id);

        return self::SUCCESS;
    }
}
