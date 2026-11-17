<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\PlannerController;
use Illuminate\Support\Facades\Route;

Route::middleware('guest')->group(function () {
    Route::view('/login', 'login')->name('login');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
});
Route::middleware('auth')->group(function () {
    Route::get('/', fn () => response()->view('app')->header('Cache-Control', 'private, no-store'))->name('home');
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
    Route::prefix('api')->controller(PlannerController::class)->group(function () {
        Route::get('/state', 'state');
        Route::post('/quests', 'storeQuest');
        Route::patch('/quests/{id}', 'updateQuest');
        Route::delete('/quests/{id}', 'deleteQuest');
        Route::post('/tasks', 'storeTask');
        Route::patch('/tasks/{id}', 'updateTask');
        Route::delete('/tasks/{id}', 'deleteTask');
        Route::post('/focus', 'startFocus');
        Route::post('/focus/stop', 'stopFocus');
    });
});
