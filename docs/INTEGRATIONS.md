# Integrations and Project Graduation

Seedbank integrations turn mature ideas into real project starting points. Graduation is intentionally plugin-based so Seedbank can support local folders, external tools, and personal workflows without hard-coding one destination.

## Graduation Flow

1. The user opens an idea at `pitch` stage or later.
2. The frontend requests available integrations from `GET /api/integrations`.
3. Each integration reports whether it is configured.
4. If an idea is selected, each integration can return readiness feedback.
5. The user chooses a target.
6. Seedbank calls `POST /api/integrations/:id/graduate/:ideaId`.
7. The integration creates the project/resource and returns a `GraduationResult`.
8. The idea stores `graduatedTo` and advances stage.

## Integration Interface

```ts
interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  isConfigured(): boolean;
  configure(config: Record<string, string>): void;
  canGraduate(idea: Idea): { ready: boolean; missing: string[] };
  graduate(idea: Idea): Promise<GraduationResult>;
}
```

The UI uses `canGraduate` to show a pre-flight readiness check. Keep the `missing` list human-readable and actionable.

## Built-In Integrations

### Archon

The Archon integration creates a project directory using conventions from a local Archon workspace. It generates context files from the idea:

- `README.md`
- `CLAUDE.md`
- `package.json` or scaffold files depending on category and tech stack

The idea is updated with a `graduatedTo` path and moved toward `plot` or `prototype`.

### Generic Project Scaffold

The generic integration creates a project directory in a configured root. It chooses a simple scaffold from the idea category:

- `game`
- `app`
- `tool`
- `local-ai`
- other project categories

This integration is useful when the user does not use Archon or wants a plain folder-based workflow.

## Writing a Custom Integration

1. Add a file in `server/src/integrations/`.
2. Implement the `Integration` interface.
3. Read and write settings through the repository settings layer.
4. Keep file writes scoped to the configured project root.
5. Generate useful starter files from the idea fields.
6. Register the integration in `server/src/integrations/registry.ts`.
7. Test with the integrations API.

Example skeleton:

```ts
import type { Idea, GraduationResult } from '../../../shared/types.js';
import type { Integration } from './types.js';

export class MyIntegration implements Integration {
  id = 'my-tool';
  name = 'My Tool';
  description = 'Creates a project in my external workflow.';
  icon = 'folder';

  isConfigured() {
    return true;
  }

  configure(config: Record<string, string>) {
    // Save config through repository settings.
  }

  canGraduate(idea: Idea) {
    const missing: string[] = [];
    if (!idea.title.trim()) missing.push('title');
    if (!idea.pitch.trim()) missing.push('pitch');
    return { ready: missing.length === 0, missing };
  }

  async graduate(idea: Idea): Promise<GraduationResult> {
    // Create files or remote resources here.
    return {
      integrationId: this.id,
      projectName: idea.title,
      path: '/path/to/project',
      graduatedTo: '/path/to/project',
      stage: 'prototype',
      filesCreated: [],
      message: 'Project created.',
    };
  }
}
```

## API Endpoints

- `GET /api/integrations` — list integrations.
- `GET /api/integrations?ideaId=<id>` — include readiness for a specific idea.
- `POST /api/integrations/:id/configure` — save integration configuration.
- `POST /api/integrations/:id/graduate/:ideaId` — graduate an idea.

## Design Guidelines

- A graduation should create a useful starting point, not a full product.
- Generated files should preserve the user's wording where possible.
- Integrations should explain missing fields before failing.
- Paths should be configurable.
- Avoid destructive writes outside the configured project root.
- Return clear messages that can be shown directly in the UI.
