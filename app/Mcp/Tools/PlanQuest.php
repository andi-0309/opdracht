<?php

namespace App\Mcp\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Illuminate\Validation\Rule;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tools\Annotations\IsDestructive;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;

#[Name('plan_quest')]
#[Description('Create or update an own quest/goal. action=create requires title; action=update requires id. Omit unchanged fields. Choose a curated color: Salbei #789469, Ozean #6289a6, Lavendel #9180ad, Beere #ad738c, Terrakotta #b87960, Honig #b69a52, Petrol #578f89, Schiefer #7c8794. Requires planner:write. Creates are not idempotent; read state before retrying an uncertain call.')]
#[IsDestructive]
#[IsOpenWorld(false)]
class PlanQuest extends PlannerTool
{
    private const COLORS = ['#789469', '#6289a6', '#9180ad', '#ad738c', '#b87960', '#b69a52', '#578f89', '#7c8794'];

    public function handle(Request $request): Response
    {
        $data = $request->validate([
            'action' => ['required', 'in:create,update'],
            'id' => ['required_if:action,update', 'integer', 'min:1'],
            'color' => ['sometimes', Rule::in(self::COLORS)],
        ]);

        return $this->callPlanner($request, $data['action'] === 'create' ? 'storeQuest' : 'updateQuest', true, $data['action'] === 'update' ? (int) $data['id'] : null);
    }

    /** @return array<string, Type> */
    public function schema(JsonSchema $schema): array
    {
        return [
            'action' => $schema->string()->enum(['create', 'update'])->required(),
            'id' => $schema->integer()->description('Required when updating an existing own quest.'),
            'title' => $schema->string()->description('Required on create; up to 200 characters.'),
            'description' => $schema->string()->nullable(),
            'color' => $schema->string()->enum(self::COLORS),
            'completed' => $schema->boolean(),
        ];
    }
}
