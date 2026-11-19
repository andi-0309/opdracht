<?php

namespace Tests\Feature;

use App\Models\FocusSession;
use App\Models\Quest;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Tests\TestCase;

class WeeklyPlanningTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_quest_meaning_and_optional_weekly_goal_are_validated_and_retained(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $id = $this->postJson('/api/quests', ['title' => 'Learn', 'why' => 'Curiosity', 'description' => 'Study', 'weekly_minutes' => 240])->assertCreated()->json('id');
        $this->getJson('/api/state')->assertJsonPath('quests.0.why', 'Curiosity')->assertJsonPath('quests.0.description', 'Study')->assertJsonPath('quests.0.weekly_minutes', 240);
        $this->patchJson('/api/quests/'.$id, ['title' => 'Keep learning'])->assertOk();
        $this->assertDatabaseHas('quests', ['id' => $id, 'weekly_minutes' => 240, 'why' => 'Curiosity']);
        foreach ([0, -1, 10081, 'bad'] as $invalid) {
            $this->patchJson('/api/quests/'.$id, ['weekly_minutes' => $invalid])->assertUnprocessable();
        }
        $this->patchJson('/api/quests/'.$id, ['weekly_minutes' => null])->assertOk();
        $this->assertDatabaseHas('quests', ['id' => $id, 'weekly_minutes' => null]);
        $this->actingAs(User::factory()->create())->patchJson('/api/quests/'.$id, ['why' => 'Foreign'])->assertNotFound();
    }

    public function test_weekly_reviews_are_scoped_to_user_and_week_and_can_be_cleared(): void
    {
        $this->actingAs(User::factory()->create());
        $this->putJson('/api/review', ['week' => '2026-11-19', 'notes' => 'Worked well'])->assertOk();
        $this->getJson('/api/review?week=2026-11-16')->assertOk()->assertJsonPath('review', 'Worked well')->assertJsonPath('week_start', '2026-11-16');
        $this->getJson('/api/review?week=2026-11-23')->assertJsonPath('review', '');
        $this->putJson('/api/review', ['week' => '2026-11-16', 'notes' => null])->assertOk();
        $this->getJson('/api/review?week=2026-11-16')->assertJsonPath('review', '');
        $this->putJson('/api/review', ['week' => 'nonsense', 'notes' => 'bad'])->assertUnprocessable();
        $this->putJson('/api/review', ['week' => '2026-11-16', 'notes' => str_repeat('a', 20001)])->assertUnprocessable();
        $this->putJson('/api/review', ['week' => '2026-11-16'])->assertUnprocessable();
        $this->putJson('/api/review', ['week' => '2026-11-16', 'notes' => 'Private review'])->assertOk();
        $this->actingAs(User::factory()->create())->getJson('/api/review?week=2026-11-16')->assertJsonPath('review', '');
    }

    public function test_booked_log_clips_week_boundaries_excludes_active_and_foreign_and_retains_deleted_task_titles(): void
    {
        $this->travelTo(now()->setDate(2026, 11, 16)->startOfDay()->subMinutes(30));
        $user = User::factory()->create();
        $quest = Quest::factory()->create(['user_id' => $user->id, 'weekly_minutes' => 60]);
        $task = Task::factory()->create(['user_id' => $user->id, 'quest_id' => $quest->id, 'title' => 'Remember this']);
        $this->actingAs($user);
        $this->postJson('/api/focus', ['task_id' => $task->id])->assertCreated();
        $session = FocusSession::where('user_id', $user->id)->firstOrFail();
        $this->travel(60)->minutes();
        $this->postJson('/api/focus/stop', ['session_id' => $session->id])->assertOk();
        $this->deleteJson('/api/tasks/'.$task->id)->assertOk();
        FocusSession::create(['user_id' => User::factory()->create()->id, 'started_at' => now()->subMinutes(20), 'ended_at' => now(), 'seconds' => 1200]);
        $another = Task::factory()->create(['user_id' => $user->id]);
        $this->postJson('/api/focus', ['task_id' => $another->id])->assertCreated();
        $this->getJson('/api/review?week=2026-11-16')->assertOk()->assertJsonCount(1, 'sessions')->assertJsonPath('seconds', 1800)->assertJsonPath('quest_seconds', 1800)->assertJsonPath('sessions.0.title', 'Remember this')->assertJsonPath('sessions.0.quest_id', $quest->id);
        $this->getJson('/api/state')->assertJsonPath('weekly.quest_seconds.'.$quest->id, 1800);
        $this->getJson('/api/review?week=2026-11-09')->assertJsonPath('seconds', 1800);
        $this->travelBack();
    }

    public function test_review_requires_login(): void
    {
        $this->getJson('/api/review')->assertUnauthorized();
        $this->putJson('/api/review', ['notes' => 'private'])->assertUnauthorized();
    }
}
