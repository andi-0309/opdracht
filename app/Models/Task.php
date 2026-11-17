<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Task extends Model
{
    use HasFactory;

    protected $fillable = ['user_id', 'quest_id', 'title', 'notes', 'scheduled_for', 'completed_at'];

    protected function casts(): array
    {
        return ['scheduled_for' => 'date:Y-m-d', 'completed_at' => 'datetime'];
    }
}
