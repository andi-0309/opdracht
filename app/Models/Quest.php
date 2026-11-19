<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Quest extends Model
{
    use HasFactory;

    protected $fillable = ['user_id', 'title', 'description', 'why', 'weekly_minutes', 'color', 'completed_at'];

    protected function casts(): array
    {
        return ['weekly_minutes' => 'integer', 'completed_at' => 'datetime'];
    }
}
