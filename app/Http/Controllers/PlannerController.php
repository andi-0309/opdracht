<?php

namespace App\Http\Controllers;

use App\Models\FocusSession;
use App\Models\Quest;
use App\Models\Task;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PlannerController extends Controller
{
    public function state(Request $request): JsonResponse
    {
        $uid = $request->user()->id;
        $now = CarbonImmutable::now();
        $start = $now->startOfWeek();
        $sessions = FocusSession::where('user_id', $uid)->where(fn ($q) => $q->whereNull('ended_at')->orWhere('ended_at', '>=', $start))->get();
        $seconds = $sessions->sum(fn ($s) => max(0, $s->started_at->max($start)->diffInSeconds($s->ended_at ?? $now, false)));
        $totals = FocusSession::where('user_id', $uid)->whereNotNull('ended_at')->selectRaw('task_id, SUM(seconds) as total')->groupBy('task_id')->pluck('total', 'task_id');
        $tasks = Task::where('user_id', $uid)->orderBy('position')->orderBy('id')->get()->map(function (Task $task) use ($totals) {
            return [...$task->only(['id', 'quest_id', 'title', 'notes', 'completed_at']), 'scheduled_for' => $task->scheduled_for?->format('Y-m-d'), 'focus_seconds' => (int) ($totals[$task->id] ?? 0)];
        });

        return response()->json([
            'user' => $request->user()->only('name'), 'today' => $now->format('Y-m-d'), 'server_now' => $now->toIso8601String(),
            'quests' => Quest::where('user_id', $uid)->orderBy('id')->get(['id', 'title', 'description', 'color', 'completed_at']),
            'tasks' => $tasks, 'focus' => $sessions->firstWhere('ended_at', null)?->only(['id', 'task_id', 'started_at']),
            'weekly' => ['seconds' => (int) $seconds, 'completed' => Task::where('user_id', $uid)->where('completed_at', '>=', $start)->count()],
        ])->header('Cache-Control', 'private, no-store');
    }

    public function storeQuest(Request $request): JsonResponse
    {
        $quest = Quest::create([...$this->questData($request), 'user_id' => $request->user()->id]);

        return response()->json(['id' => $quest->id], 201);
    }

    public function updateQuest(Request $request, int $id): JsonResponse
    {
        $quest = Quest::where('user_id', $request->user()->id)->findOrFail($id);
        $data = $this->questData($request, true);
        $quest->update($data);

        return response()->json(['ok' => true]);
    }

    public function deleteQuest(Request $request, int $id): JsonResponse
    {
        Quest::where('user_id', $request->user()->id)->findOrFail($id)->delete();

        return response()->json(['ok' => true]);
    }

    private function questData(Request $request, bool $partial = false): array
    {
        $data = $request->validate([
            'title' => [$partial ? 'sometimes' : 'required', 'required', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:10000'], 'color' => ['sometimes', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'completed' => ['sometimes', 'boolean'],
        ]);
        if (array_key_exists('completed', $data)) {
            $data['completed_at'] = $data['completed'] ? now() : null;
            unset($data['completed']);
        }

        return $data;
    }

    private function taskData(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'title' => [$partial ? 'sometimes' : 'required', 'required', 'string', 'max:200'],
            'notes' => ['nullable', 'string', 'max:10000'],
            'quest_id' => ['nullable', 'integer', Rule::exists('quests', 'id')->where('user_id', $request->user()->id)],
            'scheduled_for' => ['nullable', 'date_format:Y-m-d'], 'completed' => ['sometimes', 'boolean'],
        ]);
    }

    public function storeTask(Request $request): JsonResponse
    {
        $data = $this->taskData($request);
        unset($data['completed']);
        $task = DB::transaction(function () use ($data, $request) {
            $position = (int) Task::where('user_id', $request->user()->id)->max('position') + 1;

            return Task::create([...$data, 'user_id' => $request->user()->id, 'position' => $position]);
        });

        return response()->json(['id' => $task->id], 201);
    }

    public function reorderTasks(Request $request): JsonResponse
    {
        $data = $request->validate([
            'task_ids' => ['required', 'array', 'min:1', 'max:10000'],
            'task_ids.*' => ['required', 'integer', 'distinct'],
            'moved_task_id' => [Rule::requiredIf($request->exists('scheduled_for')), 'integer'],
            'scheduled_for' => ['present_with:moved_task_id', 'nullable', 'date_format:Y-m-d'],
        ]);
        DB::transaction(function () use ($request, $data) {
            $tasks = Task::where('user_id', $request->user()->id)->orderBy('position')->orderBy('id')->lockForUpdate()->get();
            $ids = array_map('intval', $data['task_ids']);
            abort_unless(count(array_intersect($ids, $tasks->modelKeys())) === count($ids), 422, 'Die Aufgabenliste ist nicht mehr aktuell. Bitte lade sie erneut.');
            if (array_key_exists('moved_task_id', $data)) {
                $movedId = (int) $data['moved_task_id'];
                abort_unless(in_array($movedId, $ids, true), 422, 'Die verschobene Aufgabe fehlt in der Aufgabenliste.');
                Task::where('user_id', $request->user()->id)->whereKey($movedId)->update(['scheduled_for' => $data['scheduled_for']]);
            }
            $ordered = [...$ids, ...array_values(array_diff($tasks->modelKeys(), $ids))];
            foreach ($ordered as $position => $id) {
                Task::where('user_id', $request->user()->id)->whereKey($id)->update(['position' => $position + 1]);
            }
        });

        return response()->json(['ok' => true]);
    }

    public function updateTask(Request $request, int $id): JsonResponse
    {
        $data = $this->taskData($request, true);
        DB::transaction(function () use ($request, $id, $data) {
            $task = Task::where('user_id', $request->user()->id)->findOrFail($id);
            if (array_key_exists('completed', $data)) {
                $data['completed_at'] = $data['completed'] ? ($task->completed_at ?? now()) : null;
                if ($data['completed']) {
                    $this->finish(FocusSession::where('user_id', $request->user()->id)->where('task_id', $id)->whereNull('ended_at')->first());
                }
                unset($data['completed']);
            }
            $task->update($data);
        });

        return response()->json(['ok' => true]);
    }

    public function deleteTask(Request $request, int $id): JsonResponse
    {
        DB::transaction(function () use ($request, $id) {
            $task = Task::where('user_id', $request->user()->id)->findOrFail($id);
            $this->finish(FocusSession::where('user_id', $request->user()->id)->where('task_id', $id)->whereNull('ended_at')->first());
            $task->delete();
        });

        return response()->json(['ok' => true]);
    }

    public function startFocus(Request $request): JsonResponse
    {
        $data = $request->validate(['task_id' => ['required', 'integer']]);
        $session = DB::transaction(function () use ($request, $data) {
            $task = Task::where('user_id', $request->user()->id)->findOrFail($data['task_id']);
            abort_if($task->completed_at !== null, 422, 'Erledigte Aufgaben können nicht gestartet werden.');
            $active = FocusSession::where('user_id', $request->user()->id)->whereNull('ended_at')->first();
            if ($active?->task_id === $task->id) {
                return $active;
            }
            $this->finish($active);

            return FocusSession::create(['user_id' => $request->user()->id, 'task_id' => $task->id, 'started_at' => now()]);
        });

        return response()->json($session->only('id'), 201);
    }

    public function stopFocus(Request $request): JsonResponse
    {
        $data = $request->validate(['session_id' => ['required', 'integer']]);
        DB::transaction(function () use ($request, $data) {
            $session = FocusSession::where('user_id', $request->user()->id)->findOrFail($data['session_id']);
            $this->finish($session);
        });

        return response()->json(['ok' => true]);
    }

    private function finish(?FocusSession $session): void
    {
        if ($session && ! $session->ended_at) {
            $end = now();
            $session->update(['ended_at' => $end, 'seconds' => (int) max(0, $session->started_at->diffInSeconds($end, false))]);
        }
    }
}
