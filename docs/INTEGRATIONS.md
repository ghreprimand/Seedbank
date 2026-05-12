# Integrations and Graduation

Seedbank integrations turn mature ideas into real project starting points. Graduation is intentionally server-side because adapters write files and return project paths.

## Where to Configure Integrations

Integration settings are managed in the app at:
- `Settings -> Integrations`

Built-in adapters:
- `Local Project` (`generic-project`) — general-purpose external project scaffold
- `Archon` (`archon`) — optional adapter for Archon-specific workflows

The Settings tab stores adapter configuration in the server `settings` table under namespaced keys:
- `integration:generic-project`
- `integration:archon` (optional adapter-specific)

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
- `projectRoot` (default external project root; set in Settings)

Behavior:
- creates a standalone scaffold in a configured external project root
- chooses target stage based on category helper logic

### Archon (optional adapter) (`server/src/integrations/archon.ts`)

Config fields:
- `archonRoot`
- `projectRoot` (typically `<archonRoot>/projects`)

Behavior:
- validates Archon workspace roots
- scaffolds project files with Archon-specific context artifacts

## Continue With Agent Handoff

After graduation, the UI can launch "Continue with agent" using the returned `path` from graduation.

The backend enforces that continue-mode agent runs (`POST /api/agents/runs` with `projectPath`) are constrained to configured integration roots:
- configured `projectRoot` values for enabled adapters
- adapter-specific derived roots when applicable (for example optional Archon project directories)

If `projectPath` is outside configured roots, the run is rejected.

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
