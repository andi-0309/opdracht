<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('color', 7)->default('#648773');
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('quest_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title');
            $table->text('notes')->nullable();
            $table->date('scheduled_for')->nullable()->index();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
        Schema::create('focus_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('task_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->unsignedInteger('seconds')->default(0);
            $table->timestamps();
            $table->index(['user_id', 'started_at']);
        });
        DB::statement('CREATE UNIQUE INDEX one_active_focus_per_user ON focus_sessions (user_id) WHERE ended_at IS NULL');
    }

    public function down(): void
    {
        Schema::dropIfExists('focus_sessions');
        Schema::dropIfExists('tasks');
        Schema::dropIfExists('quests');
    }
};
