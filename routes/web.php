<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\OidcController;
use App\Http\Controllers\PlannerController;
use Illuminate\Support\Facades\Route;

Route::middleware('guest')->group(function () {
    Route::get('/login', fn () => response()->view('login')->header('Cache-Control', 'private, no-store'))->name('login');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    Route::get('/auth/oidc', [OidcController::class, 'redirect'])->middleware('throttle:10,1')->name('oidc.redirect');
    Route::get('/auth/oidc/callback', [OidcController::class, 'callback'])->middleware('throttle:20,1')->name('oidc.callback');
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
