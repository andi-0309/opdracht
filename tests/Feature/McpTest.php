<?php

namespace Tests\Feature;

use App\Models\Quest;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class McpTest extends TestCase
{
    use LazilyRefreshDatabase;

    private function token(User $user, array $abilities = ['planner:read']): string
    {
        return $user->createToken('mcp:test', $abilities, now()->addDay())->plainTextToken;
    }

    private function rpc(?string $token, string $method, array $params = [], array $headers = []): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->postJson('/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => $method, 'params' => (object) $params], [
            ...($token === null ? [] : ['Authorization' => 'Bearer '.$token]), ...$headers,
        ]);
    }

    private function tool(string $token, string $name, array $arguments = []): TestResponse
    {
        return $this->rpc($token, 'tools/call', ['name' => $name, 'arguments' => (object) $arguments]);
    }

    public function test_mcp_requires_a_bearer_token_even_with_a_web_session(): void
    {
        $this->rpc(null, 'tools/list')->assertUnauthorized();
        $this->rpc('invalid', 'tools/list')->assertUnauthorized();
        $this->actingAs(User::factory()->create())->postJson('/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/list'])->assertUnauthorized();
    }

    public function test_handshake_and_tool_discovery_work_with_a_read_token(): void
    {
        $token = $this->token(User::factory()->create());
        $this->rpc($token, 'initialize', ['protocolVersion' => '2025-03-26', 'capabilities' => (object) [], 'clientInfo' => ['name' => 'test', 'version' => '1.0']])
            ->assertOk()->assertJsonPath('result.serverInfo.name', 'Opdracht Planner');
        $tools = $this->rpc($token, 'tools/list')->assertOk()->json('result.tools');
        $this->assertEqualsCanonicalizing(['read_planner', 'plan_task', 'plan_quest'], array_column($tools, 'name'));
    }

    public function test_read_planner_returns_only_own_data_and_disables_caching(): void
    {
        $user = User::factory()->create();
        Task::factory()->create(['user_id' => $user->id, 'title' => 'Eigene Aufgabe']);
        Task::factory()->create(['title' => 'Fremdes Geheimnis']);
        Quest::factory()->create(['title' => 'Fremdes Ziel']);
        $response = $this->tool($this->token($user), 'read_planner')->assertOk()->assertJsonPath('result.isError', false);
        $text = $response->getContent();
        $this->assertStringContainsString('Eigene Aufgabe', $text);
        $this->assertStringNotContainsString('Fremdes Geheimnis', $text);
        $this->assertStringNotContainsString('Fremdes Ziel', $text);
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
    }

    public function test_read_only_and_unrelated_tokens_cannot_write(): void
    {
        $user = User::factory()->create();
        $this->tool($this->token($user), 'plan_task', ['action' => 'create', 'title' => 'Verboten'])->assertOk()->assertJsonPath('result.isError', true);
        $this->rpc($this->token($user, ['other']), 'tools/list')->assertForbidden();
        $this->assertDatabaseCount('tasks', 0);
    }

    public function test_write_token_can_create_schedule_complete_and_reopen_own_task(): void
    {
        $user = User::factory()->create();
        $token = $this->token($user, ['planner:read', 'planner:write']);
        $quest = Quest::factory()->create(['user_id' => $user->id]);
        $this->tool($token, 'plan_task', ['action' => 'create', 'title' => 'Gemeinsam planen', 'quest_id' => $quest->id, 'scheduled_for' => '2026-11-20', 'user_id' => 999])
            ->assertOk()->assertJsonPath('result.isError', false);
        $task = Task::sole();
        $this->assertSame($user->id, $task->user_id);
        $this->tool($token, 'plan_task', ['action' => 'update', 'id' => $task->id, 'scheduled_for' => null, 'completed' => true])->assertJsonPath('result.isError', false);
        $this->assertNotNull($task->fresh()->completed_at);
        $this->assertNull($task->fresh()->scheduled_for);
        $this->tool($token, 'plan_task', ['action' => 'update', 'id' => $task->id, 'completed' => false])->assertJsonPath('result.isError', false);
        $this->assertNull($task->fresh()->completed_at);
    }

    public function test_foreign_tasks_quests_and_quest_assignments_cannot_be_changed(): void
    {
        $user = User::factory()->create();
        $token = $this->token($user, ['planner:read', 'planner:write']);
        $task = Task::factory()->create();
        $quest = Quest::factory()->create();
        $this->tool($token, 'plan_task', ['action' => 'update', 'id' => $task->id, 'title' => 'Changed'])->assertJsonPath('result.isError', true);
        $this->tool($token, 'plan_quest', ['action' => 'update', 'id' => $quest->id, 'title' => 'Changed'])->assertJsonPath('result.isError', true);
        $this->tool($token, 'plan_task', ['action' => 'create', 'title' => 'Test', 'quest_id' => $quest->id])->assertJsonPath('result.isError', true);
        $this->assertSame($task->title, $task->fresh()->title);
        $this->assertSame($quest->title, $quest->fresh()->title);
        $this->assertDatabaseCount('tasks', 1);
    }

    public function test_quest_tools_use_curated_colors_and_keep_omitted_fields(): void
    {
        $user = User::factory()->create();
        $token = $this->token($user, ['planner:read', 'planner:write']);
        $this->tool($token, 'plan_quest', ['action' => 'create', 'title' => 'Ein Ziel', 'color' => '#6289a6'])->assertJsonPath('result.isError', false);
        $quest = Quest::sole();
        $this->tool($token, 'plan_quest', ['action' => 'update', 'id' => $quest->id, 'description' => 'Warum'])->assertJsonPath('result.isError', false);
        $this->assertSame('#6289a6', $quest->fresh()->color);
        $this->tool($token, 'plan_quest', ['action' => 'create', 'title' => 'Invalid', 'color' => '#123456'])->assertJsonPath('result.isError', true);
        $this->assertDatabaseCount('quests', 1);
    }

    public function test_invalid_actions_dates_ids_and_titles_are_rejected(): void
    {
        $token = $this->token(User::factory()->create(), ['planner:read', 'planner:write']);
        foreach ([['action' => 'delete', 'id' => 1], ['action' => 'update'], ['action' => 'create'], ['action' => 'create', 'title' => 'Test', 'scheduled_for' => 'not-a-date']] as $arguments) {
            $this->tool($token, 'plan_task', $arguments)->assertJsonPath('result.isError', true);
        }
        $this->assertDatabaseCount('tasks', 0);
    }

    public function test_expired_and_revoked_tokens_are_rejected(): void
    {
        $user = User::factory()->create();
        $expired = $user->createToken('mcp:expired', ['planner:read'], now()->subMinute());
        $this->rpc($expired->plainTextToken, 'tools/list')->assertUnauthorized();
        $token = $user->createToken('mcp:revoked', ['planner:read'], now()->addDay());
        $token->accessToken->delete();
        $this->rpc($token->plainTextToken, 'tools/list')->assertUnauthorized();
    }

    public function test_untrusted_origin_is_rejected(): void
    {
        $token = $this->token(User::factory()->create());
        $this->rpc($token, 'tools/list', [], ['Origin' => 'https://evil.example'])->assertForbidden();
    }

    public function test_token_cli_limits_expiry_and_scope_and_lists_without_plaintext(): void
    {
        $user = User::factory()->create();
        $this->artisan('opdracht:mcp-token', ['email' => $user->email, '--days' => '10'])->assertSuccessful();
        $token = $user->tokens()->sole();
        $this->assertSame(['planner:read'], $token->abilities);
        $this->assertNotNull($token->expires_at);
        $this->assertSame(64, strlen($token->token));
        $this->artisan('opdracht:mcp-token', ['email' => $user->email, '--list' => true])->doesntExpectOutputToContain($token->token)->assertSuccessful();
        $this->artisan('opdracht:mcp-token', ['email' => $user->email, '--revoke' => $token->id])->assertSuccessful();
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->artisan('opdracht:mcp-token', ['email' => $user->email, '--days' => '0'])->assertFailed();
        $this->artisan('opdracht:mcp-token', ['email' => $user->email, '--days' => '366'])->assertFailed();
    }

    public function test_token_cli_cannot_revoke_another_users_token(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $token = $owner->createToken('mcp:other', ['planner:read']);
        $this->artisan('opdracht:mcp-token', ['email' => $other->email, '--revoke' => $token->accessToken->id])->assertFailed();
        $this->assertDatabaseCount('personal_access_tokens', 1);
    }
}
