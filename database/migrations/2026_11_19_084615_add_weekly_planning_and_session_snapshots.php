<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quests', function (Blueprint $table) {
            $table->text('why')->nullable();
            $table->unsignedInteger('weekly_minutes')->nullable();
        });
        Schema::table('focus_sessions', function (Blueprint $table) {
            $table->string('task_title')->nullable();
            $table->unsignedBigInteger('quest_id')->nullable();
            $table->string('quest_title')->nullable();
            $table->string('quest_color', 7)->nullable();
        });
        DB::table('focus_sessions')->orderBy('id')->chunkById(200, function ($sessions) {
            foreach ($sessions as $session) {
                $task = DB::table('tasks')->find($session->task_id);
                $quest = $task?->quest_id ? DB::table('quests')->find($task->quest_id) : null;
                DB::table('focus_sessions')->where('id', $session->id)->update([
                    'task_title' => $task?->title, 'quest_id' => $quest?->id,
                    'quest_title' => $quest?->title, 'quest_color' => $quest?->color,
                ]);
            }
        });
        Schema::create('weekly_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('week_start');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'week_start']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('weekly_reviews');
        Schema::table('quests', fn (Blueprint $table) => $table->dropColumn(['why', 'weekly_minutes']));
        Schema::table('focus_sessions', fn (Blueprint $table) => $table->dropColumn(['task_title', 'quest_id', 'quest_title', 'quest_color']));
    }
};
