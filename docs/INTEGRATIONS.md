# Integrations and Graduation

Seedbank integrations turn mature ideas into real project starting points. Graduation is intentionally server-side because adapters write files and return project paths.

## Where to Configure Integrations

Integration settings are managed in the app at:
- `Settings -> Integrations`

Built-in adapters:
- `Local Project` (`generic-project`) — general-purpose external project scaffold; works with any local directory and development workflow.

Optional custom adapters are registered in `server/src/integrations/registry.ts`. An adapter that is only useful for a specific private tool should not be documented here as a public feature; see [Adding a Custom Integration](#adding-a-custom-integration) below.

The Settings tab stores adapter configuration in the server `settings` table under namespaced keys:
- `integration:generic-project`
- `integration:<your-adapter-id>` (one key per registered adapter)

## Graduation Flow

1. User opens an idea that is ready to graduate.
2. Client requests `GET /api/integrations` (optionally with `ideaId` for readiness).
3. User configures one or more integration roots in Settings.
4. Client calls `POST /api/integrations/:id/graduate/:ideaId`.
5. Server adapter creates scaffolded files in the target location.
6. Server updates idea fields:
   - `graduatedTo`
   - `stage`
7. Webhook event `idea.graduated` is emitted when configured.

## API Endpoints

- `GET /api/integrations`
- `GET /api/integrations?ideaId=<id>` (includes readiness)
- `POST /api/integrations/:id/configure`
- `POST /api/integrations/:id/graduate/:ideaId`

All integration routes are authenticated through the standard API middleware and use `read:ideas` / `write:ideas` scopes for bearer mode.

## Adapter Implementations

### Local Project (`server/src/integrations/genericProject.ts`)

Config fields:
- `projectRoot` (external project root; set in Settings)

Behavior:
- creates a standalone scaffold in a configured external project root
- generates `README.md`, `CLAUDE.md`, and a seed context file from the idea
- chooses target stage based on category

### Custom Local Adapters

Any private or workflow-specific adapter can be added by implementing the `Integration` interface. Custom adapters follow the same configuration and graduation API as the built-in adapter.

Example fields a custom local adapter might use:
- `projectRoot` (where new project directories are created)
- `workspaceRoot` (a tool-specific workspace directory, if required)

A custom adapter should:
- validate that its required root paths exist before reporting `isConfigured()`
- write only inside configured roots
- produce `filesCreated` output so the graduation response is informative

## Continue With Agent Handoff

After graduation, the UI can launch "Continue with agent" using the returned `path` from graduation.

The backend enforces that continue-mode agent runs (`POST /api/agents/runs` with `projectPath`) are constrained to configured integration roots:
- configured `projectRoot` values for enabled adapters
- adapter-specific derived roots when applicable

If `projectPath` is outside all configured roots, the run is rejected.

## Safety Expectations

Adapters should:
- write only inside configured roots
- produce actionable starter scaffolds, not full products
- preserve idea language in generated docs where possible
- return clear `message` and `filesCreated` outputs

Agent follow-on work remains opt-in and separately controlled through `agents:run` routes and safety rails.

## Adding a Custom Integration

1. Create a file under `server/src/integrations/`.
2. Implement `Integration` from `server/src/integrations/types.ts`.
3. Read/write config via `IntegrationConfigStore` (namespaced `integration:<id>` settings).
4. Register in `server/src/integrations/registry.ts`.
5. Verify with integration APIs and graduation flow.
