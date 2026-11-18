<?php

namespace App\Mcp\Tools;

use App\Http\Controllers\PlannerController;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request as HttpRequest;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;

abstract class PlannerTool extends Tool
{
    protected function callPlanner(Request $request, string $method, bool $write = false, ?int $id = null): Response
    {
        $user = $request->user();
        if (! $user instanceof User || ! $user->tokenCan('planner:read') || ($write && ! $user->tokenCan('planner:write'))) {
            throw new AuthorizationException('Dieses Token hat nicht die erforderlichen Planer-Rechte.');
        }

        $httpRequest = HttpRequest::create('/mcp', 'POST', $request->all());
        $httpRequest->setUserResolver(fn () => $user);
        $controller = app(PlannerController::class);

        try {
            $response = $id === null ? $controller->{$method}($httpRequest) : $controller->{$method}($httpRequest, $id);
        } catch (ModelNotFoundException) {
            return Response::error('Eintrag nicht gefunden.');
        }

        return Response::json($response->getData(true));
    }
}
