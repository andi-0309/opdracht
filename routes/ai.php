<?php

use App\Http\Middleware\RequirePlannerToken;
use App\Mcp\Servers\PlannerServer;
use Illuminate\Support\Facades\Route;
use Laravel\Mcp\Facades\Mcp;

Route::middleware(['auth:sanctum', RequirePlannerToken::class, 'throttle:60,1'])->group(function (): void {
    Mcp::web('/mcp', PlannerServer::class);
});
