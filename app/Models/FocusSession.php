<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FocusSession extends Model
{
    use HasFactory;

    protected $fillable = ['user_id', 'task_id', 'started_at', 'ended_at', 'seconds', 'task_title', 'quest_id', 'quest_title', 'quest_color'];

    protected function casts(): array
    {
        return ['started_at' => 'datetime', 'ended_at' => 'datetime', 'seconds' => 'integer'];
    }
}
