<?php

namespace Tests\Feature;

use App\Models\Quest;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PlannerTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_order_is_persisted_and_new_tasks_are_appended(): void
    {
        $user = User::factory()->create();
        $a = Task::factory()->create(['user_id' => $user->id, 'position' => 1]);
        $b = Task::factory()->create(['user_id' => $user->id, 'position' => 2]);
        $c = Task::factory()->create(['user_id' => $user->id, 'position' => 3]);
        $this->actingAs($user)->postJson('/api/tasks/reorder', ['task_ids' => [$c->id, $a->id, $b->id]])->assertOk();
        $this->getJson('/api/state')->assertJsonPath('tasks.0.id', $c->id)->assertJsonPath('tasks.1.id', $a->id)->assertJsonPath('tasks.2.id', $b->id);
        $id = $this->postJson('/api/tasks', ['title' => 'New'])->assertCreated()->json('id');
        $this->getJson('/api/state')->assertJsonPath('tasks.3.id', $id);
        $this->assertDatabaseHas('tasks', ['id' => $c->id, 'position' => 1]);
    }

    public function test_reorder_rejects_foreign_unknown_and_duplicate_tasks_atomically(): void
    {
        $user = User::factory()->create();
        $task = Task::factory()->create(['user_id' => $user->id, 'position' => 9]);
        $foreign = Task::factory()->create(['position' => 8]);
        $this->actingAs($user);
        foreach ([[$task->id, $foreign->id], [$task->id, 999999], [$task->id, $task->id], [], ['invalid']] as $ids) {
            $this->postJson('/api/tasks/reorder', ['task_ids' => $ids])->assertUnprocessable();
        }
        $this->assertDatabaseHas('tasks', ['id' => $task->id, 'position' => 9]);
        $this->assertDatabaseHas('tasks', ['id' => $foreign->id, 'position' => 8]);
    }

    public function test_reorder_preserves_concurrently_added_tasks_and_running_focus(): void
    {
        $user = User::factory()->create();
        $a = Task::factory()->create(['user_id' => $user->id, 'position' => 1, 'scheduled_for' => '2026-11-18']);
        $b = Task::factory()->create(['user_id' => $user->id, 'position' => 2]);
        $new = Task::factory()->create(['user_id' => $user->id, 'position' => 3]);
        $session = $this->actingAs($user)->postJson('/api/focus', ['task_id' => $a->id])->assertCreated()->json('id');
        $this->postJson('/api/tasks/reorder', ['task_ids' => [$b->id, $a->id]])->assertOk();
        $this->getJson('/api/state')->assertJsonPath('tasks.0.id', $b->id)->assertJsonPath('tasks.1.id', $a->id)->assertJsonPath('tasks.2.id', $new->id)->assertJsonPath('focus.id', $session);
        $this->assertDatabaseHas('tasks', ['id' => $a->id, 'scheduled_for' => '2026-11-18']);
    }

    public function test_guest_cannot_read_or_write_planner(): void
    {
        $this->getJson('/api/state')->assertUnauthorized();
        $this->postJson('/api/tasks', ['title' => 'Test'])->assertUnauthorized();
        $this->postJson('/api/tasks/reorder', ['task_ids' => [1]])->assertUnauthorized();
        $this->assertDatabaseCount('tasks', 0);
    }

    public function test_user_can_plan_edit_complete_and_reopen_task(): void
    {
        $user = User::factory()->create();
        $quest = Quest::factory()->create(['user_id' => $user->id]);
        $this->actingAs($user);
        $id = $this->postJson('/api/tasks', ['title' => 'Erster Schritt', 'quest_id' => $quest->id, 'scheduled_for' => '2026-11-18', 'user_id' => 999])->assertCreated()->json('id');
        $this->assertDatabaseHas('tasks', ['id' => $id, 'user_id' => $user->id, 'quest_id' => $quest->id, 'title' => 'Erster Schritt']);
        $this->patchJson('/api/tasks/'.$id, ['title' => 'Nächster Schritt', 'notes' => 'Ein Gedanke', 'scheduled_for' => null, 'completed' => true])->assertOk();
        $this->getJson('/api/state')->assertOk()->assertJsonPath('tasks.0.title', 'Nächster Schritt')->assertJsonPath('tasks.0.scheduled_for', null);
        $this->assertNotNull(Task::find($id)->completed_at);
        $this->patchJson('/api/tasks/'.$id, ['completed' => false])->assertOk();
        $this->assertNull(Task::find($id)->completed_at);
    }

    public function test_quest_can_be_completed_reopened_and_removed_without_deleting_tasks(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $id = $this->postJson('/api/quests', ['title' => 'Ein Ziel', 'description' => 'Warum', 'color' => '#648773'])->assertCreated()->json('id');
        $task = Task::factory()->create(['user_id' => $user->id, 'quest_id' => $id]);
        $this->patchJson('/api/quests/'.$id, ['title' => 'Mein Ziel', 'completed' => true])->assertOk();
        $this->assertNotNull(Quest::find($id)->completed_at);
        $this->patchJson('/api/quests/'.$id, ['completed' => false])->assertOk();
        $this->assertNull(Quest::find($id)->completed_at);
        $this->deleteJson('/api/quests/'.$id)->assertOk();
        $this->assertModelMissing(Quest::make(['id' => $id]));
        $this->assertDatabaseHas('tasks', ['id' => $task->id, 'quest_id' => null]);
    }

    public static function privateRoutes(): array
    {
        return [['patch', 'tasks'], ['delete', 'tasks'], ['patch', 'quests'], ['delete', 'quests']];
    }

    #[DataProvider('privateRoutes')]
    public function test_foreign_records_return_404_and_remain_unchanged(string $method, string $resource): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $record = $resource === 'tasks' ? Task::factory()->create(['user_id' => $owner->id]) : Quest::factory()->create(['user_id' => $owner->id]);
        $this->actingAs($other)->json($method, '/api/'.$resource.'/'.$record->id, ['title' => 'Changed'])->assertNotFound();
        $this->assertDatabaseHas($resource, ['id' => $record->id, 'title' => $record->title, 'user_id' => $owner->id]);
    }

    public function test_state_never_returns_another_users_data(): void
    {
        $user = User::factory()->create();
        Task::factory()->create();
        Quest::factory()->create();
        $this->actingAs($user)->getJson('/api/state')->assertOk()->assertJsonCount(0, 'tasks')->assertJsonCount(0, 'quests')->assertJsonPath('focus', null);
    }

    public function test_task_cannot_reference_foreign_quest(): void
    {
        $quest = Quest::factory()->create();
        $this->actingAs(User::factory()->create())->postJson('/api/tasks', ['title' => 'Test', 'quest_id' => $quest->id])->assertUnprocessable()->assertJsonValidationErrors('quest_id');
        $this->assertDatabaseCount('tasks', 0);
    }

    public static function invalidTasks(): array
    {
        return [[['title' => ''], 'title'], [['title' => str_repeat('a', 201)], 'title'], [['title' => 'Test', 'scheduled_for' => '2026-02-31'], 'scheduled_for'], [['title' => 'Test', 'notes' => str_repeat('x', 10001)], 'notes']];
    }

    #[DataProvider('invalidTasks')]
    public function test_invalid_task_returns_422_without_saving(array $payload, string $field): void
    {
        $this->actingAs(User::factory()->create())->postJson('/api/tasks', $payload)->assertUnprocessable()->assertJsonValidationErrors($field);
        $this->assertDatabaseCount('tasks', 0);
    }

    public function test_invalid_color_cannot_enter_a_quest(): void
    {
        $this->actingAs(User::factory()->create())->postJson('/api/quests', ['title' => 'Test', 'color' => 'red; background:url(evil)'])->assertUnprocessable()->assertJsonValidationErrors('color');
        $this->assertDatabaseCount('quests', 0);
    }

    public function test_timer_switch_and_stale_stop_do_not_double_count_or_stop_new_session(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $a = Task::factory()->create(['user_id' => $user->id]);
        $b = Task::factory()->create(['user_id' => $user->id]);
        $this->actingAs($user);
        $first = $this->postJson('/api/focus', ['task_id' => $a->id])->assertCreated()->json('id');
        $this->postJson('/api/focus', ['task_id' => $a->id])->assertCreated()->assertJsonPath('id', $first);
        $this->travel(90)->seconds();
        $second = $this->postJson('/api/focus', ['task_id' => $b->id])->assertCreated()->json('id');
        $this->assertDatabaseHas('focus_sessions', ['id' => $first, 'seconds' => 90]);
        $this->postJson('/api/focus/stop', ['session_id' => $first])->assertOk();
        $this->getJson('/api/state')->assertJsonPath('focus.id', $second)->assertJsonPath('tasks.0.focus_seconds', 90);
        $this->travel(30)->seconds();
        $this->patchJson('/api/tasks/'.$b->id, ['completed' => true])->assertOk();
        $this->getJson('/api/state')->assertJsonPath('focus', null)->assertJsonPath('weekly.seconds', 120);
        $this->postJson('/api/focus', ['task_id' => $b->id])->assertUnprocessable();
        $this->assertDatabaseCount('focus_sessions', 2);
    }

    public function test_timer_survives_reload_and_counts_only_overlap_with_current_week(): void
    {
        $this->travelTo(now()->setDate(2026, 11, 15)->setTime(23, 50));
        $user = User::factory()->create();
        $task = Task::factory()->create(['user_id' => $user->id]);
        $this->actingAs($user);
        $id = $this->postJson('/api/focus', ['task_id' => $task->id])->assertCreated()->json('id');
        $this->travel(20)->minutes();
        $this->getJson('/api/state')->assertOk()->assertJsonPath('today', '2026-11-16')->assertJsonPath('focus.id', $id)->assertJsonPath('weekly.seconds', 600);
        $this->postJson('/api/focus/stop', ['session_id' => $id])->assertOk();
        $this->assertDatabaseHas('focus_sessions', ['id' => $id, 'seconds' => 1200]);
        $this->getJson('/api/state')->assertJsonPath('weekly.seconds', 600);
    }

    public function test_deleting_running_task_preserves_recorded_time(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $task = Task::factory()->create(['user_id' => $user->id]);
        $this->actingAs($user);
        $id = $this->postJson('/api/focus', ['task_id' => $task->id])->assertCreated()->json('id');
        $this->travel(60)->seconds();
        $this->deleteJson('/api/tasks/'.$task->id)->assertOk();
        $this->assertModelMissing($task);
        $this->assertDatabaseHas('focus_sessions', ['id' => $id, 'task_id' => null, 'seconds' => 60]);
        $this->getJson('/api/state')->assertJsonPath('focus', null)->assertJsonPath('weekly.seconds', 60);
    }

    public function test_foreign_timer_cannot_be_started_or_stopped(): void
    {
        $owner = User::factory()->create();
        $task = Task::factory()->create(['user_id' => $owner->id]);
        $id = $this->actingAs($owner)->postJson('/api/focus', ['task_id' => $task->id])->assertCreated()->json('id');
        $this->actingAs(User::factory()->create())->postJson('/api/focus', ['task_id' => $task->id])->assertNotFound();
        $this->postJson('/api/focus/stop', ['session_id' => $id])->assertNotFound();
        $this->assertDatabaseHas('focus_sessions', ['id' => $id, 'ended_at' => null]);
    }

    public function test_login_logout_and_failed_login(): void
    {
        $user = User::factory()->create(['password' => 'correct-password']);
        $this->post('/login', ['email' => $user->email, 'password' => 'wrong'])->assertSessionHasErrors('email');
        $this->assertGuest();
        $this->post('/login', ['email' => $user->email, 'password' => 'correct-password'])->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
        $this->post('/logout')->assertRedirect('/login');
        $this->assertGuest();
    }

    public function test_repeated_bad_passwords_are_rate_limited(): void
    {
        $user = User::factory()->create();
        for ($i = 0; $i < 5; $i++) {
            $this->post('/login', ['email' => $user->email, 'password' => 'wrong']);
        }
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertSessionHasErrors(['email' => 'Zu viele Versuche. Bitte in einer Minute erneut versuchen.']);
        $this->assertGuest();
    }

    public function test_command_creates_account_and_requires_explicit_reset(): void
    {
        $this->artisan('opdracht:user', ['email' => 'test@example.test', '--password' => 'a-secure-test-password', '--no-interaction' => true])->assertExitCode(0);
        $this->assertDatabaseHas('users', ['email' => 'test@example.test']);
        $this->artisan('opdracht:user', ['email' => 'test@example.test', '--password' => 'different-password', '--no-interaction' => true])->assertExitCode(1);
        $this->assertDatabaseCount('users', 1);
        $this->artisan('opdracht:user', ['email' => 'test@example.test', '--password' => 'different-password', '--reset-password' => true, '--no-interaction' => true])->assertExitCode(0);
        $this->post('/login', ['email' => 'test@example.test', 'password' => 'different-password'])->assertRedirect('/');
    }
}
