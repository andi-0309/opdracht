<?php

namespace App\Mcp\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsDestructive;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;

#[Name('plan_task')]
#[Description('Create or update an own task. action=create requires title; action=update requires id and changes only supplied fields. scheduled_for is YYYY-MM-DD or null to unschedule. quest_id must be an own quest ID or null. completed marks/reopens a task on update. Requires planner:write. Creates are not idempotent: read state before retrying an uncertain call.')]
#[IsDestructive]
#[IsOpenWorld(false)]
class PlanTask extends PlannerTool
{
    public function handle(Request $request): Response
    {
        $data = $request->validate([
            'action' => ['required', 'in:create,update'],
            'id' => ['required_if:action,update', 'integer', 'min:1'],
        ]);

        return $this->callPlanner($request, $data['action'] === 'create' ? 'storeTask' : 'updateTask', true, $data['action'] === 'update' ? (int) $data['id'] : null);
    }

    /** @return array<string, Type> */
    public function schema(JsonSchema $schema): array
    {
        return [
            'action' => $schema->string()->enum(['create', 'update'])->required(),
            'id' => $schema->integer()->description('Required when updating an existing own task.'),
            'title' => $schema->string()->description('Required on create; up to 200 characters.'),
            'notes' => $schema->string()->nullable(),
            'scheduled_for' => $schema->string()->nullable()->description('YYYY-MM-DD or null.'),
            'quest_id' => $schema->integer()->nullable(),
            'completed' => $schema->boolean()->description('Update only: true to complete, false to reopen.'),
        ];
    }
}
