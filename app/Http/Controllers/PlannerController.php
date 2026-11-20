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
        $user = $request->user();
        $now = CarbonImmutable::now();
        $start = $now->startOfWeek();

        $sessions = FocusSession::where('user_id', $user->id)
            ->where(fn ($query) => $query->whereNull('ended_at')->orWhere('ended_at', '>=', $start))
            ->get();
        $secondsThisWeek = fn (FocusSession $session) => max(
            0,
            $session->started_at->max($start)->diffInSeconds($session->ended_at ?? $now, false),
        );
        $questSeconds = $sessions->whereNotNull('quest_id')->groupBy('quest_id')
            ->map(fn ($group) => (int) $group->sum($secondsThisWeek));
        $taskSeconds = FocusSession::where('user_id', $user->id)->whereNotNull('ended_at')
            ->selectRaw('task_id, SUM(seconds) as total')->groupBy('task_id')->pluck('total', 'task_id');

        $tasks = Task::where('user_id', $user->id)->orderBy('position')->orderBy('id')->get()
            ->map(fn (Task $task) => [
                ...$task->only(['id', 'quest_id', 'title', 'notes', 'completed_at']),
                'scheduled_for' => $task->scheduled_for?->format('Y-m-d'),
                'focus_seconds' => (int) ($taskSeconds[$task->id] ?? 0),
            ]);

        return response()->json([
            'user' => $user->only('name'),
            'today' => $now->format('Y-m-d'),
            'server_now' => $now->toIso8601String(),
            'quests' => Quest::where('user_id', $user->id)->orderBy('id')
                ->get(['id', 'title', 'description', 'why', 'weekly_minutes', 'color', 'completed_at']),
            'tasks' => $tasks,
            'focus' => $sessions->firstWhere('ended_at', null)?->only(['id', 'task_id', 'started_at']),
            'weekly' => [
                'quest_seconds' => $questSeconds,
                'seconds' => (int) $sessions->sum($secondsThisWeek),
                'completed' => Task::where('user_id', $user->id)->where('completed_at', '>=', $start)->count(),
            ],
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
            'title' => [...($partial ? ['sometimes'] : []), 'required', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:10000'],
            'why' => ['nullable', 'string', 'max:10000'],
            'weekly_minutes' => ['nullable', 'integer', 'min:1', 'max:10080'], 'color' => ['sometimes', 'regex:/^#[0-9a-fA-F]{6}$/'],
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
            'title' => [...($partial ? ['sometimes'] : []), 'required', 'string', 'max:200'],
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
                    $this->finish($this->activeFocus($task->user_id, $task->id));
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
            $this->finish($this->activeFocus($task->user_id, $task->id));
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
            $active = $this->activeFocus($task->user_id);
            if ($active?->task_id === $task->id) {
                return $active;
            }
            $this->finish($active);
            $quest = Quest::where('user_id', $request->user()->id)->find($task->quest_id);

            return FocusSession::create(['user_id' => $request->user()->id, 'task_id' => $task->id, 'started_at' => now(),
                'task_title' => $task->title, 'quest_id' => $task->quest_id,
                'quest_title' => $quest?->title,
                'quest_color' => $quest?->color,
            ]);
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

    private function reviewWeek(Request $request): CarbonImmutable
    {
        $data = $request->validate(['week' => ['sometimes', 'required', 'date_format:Y-m-d']]);

        return (isset($data['week']) ? CarbonImmutable::parse($data['week']) : CarbonImmutable::now())->startOfWeek();
    }

    public function review(Request $request): JsonResponse
    {
        $start = $this->reviewWeek($request);
        $end = $start->addWeek();
        $uid = $request->user()->id;
        $sessions = FocusSession::where('user_id', $uid)->whereNotNull('ended_at')
            ->where('started_at', '<', $end)->where('ended_at', '>', $start)->orderBy('started_at')->get()
            ->map(function (FocusSession $session) use ($start, $end) {
                $from = $session->started_at->toImmutable()->max($start);
                $to = $session->ended_at->toImmutable()->min($end);

                return [
                    'id' => $session->id, 'task_id' => $session->task_id,
                    'title' => $session->task_title ?? 'Gelöschte Aufgabe',
                    'quest_id' => $session->quest_id, 'quest_title' => $session->quest_title,
                    'quest_color' => $session->quest_color,
                    'started_at' => $from->toIso8601String(), 'ended_at' => $to->toIso8601String(),
                    'seconds' => (int) max(0, $from->diffInSeconds($to, false)),
                ];
            });

        return response()->json([
            'week_start' => $start->format('Y-m-d'), 'timezone' => config('app.timezone'),
            'sessions' => $sessions,
            'seconds' => $sessions->sum('seconds'),
            'quest_seconds' => $sessions->whereNotNull('quest_id')->sum('seconds'),
            'review' => DB::table('weekly_reviews')->where('user_id', $uid)->where('week_start', $start->format('Y-m-d'))->value('notes') ?? '',
        ])->header('Cache-Control', 'private, no-store');
    }

    public function saveReview(Request $request): JsonResponse
    {
        $start = $this->reviewWeek($request);
        $data = $request->validate(['notes' => ['present', 'nullable', 'string', 'max:20000']]);
        DB::table('weekly_reviews')->updateOrInsert([
            'user_id' => $request->user()->id, 'week_start' => $start->format('Y-m-d'),
        ], ['notes' => $data['notes'], 'updated_at' => now(), 'created_at' => now()]);

        return response()->json(['ok' => true]);
    }

    private function activeFocus(int $userId, ?int $taskId = null): ?FocusSession
    {
        $query = FocusSession::where('user_id', $userId)->whereNull('ended_at');
        if ($taskId !== null) {
            $query->where('task_id', $taskId);
        }

        return $query->first();
    }

    private function finish(?FocusSession $session): void
    {
        if ($session && ! $session->ended_at) {
            $end = now();
            $session->update(['ended_at' => $end, 'seconds' => (int) max(0, $session->started_at->diffInSeconds($end, false))]);
        }
    }
}
