# Integrations and Graduation

Seedbank integrations turn mature ideas into real project starting points. Graduation is intentionally server-side because integrations write files and return project paths.

## Where to Configure Integrations

Integration settings are managed in the app at:
- `Settings -> Integrations`

Current built-ins:
- `Archon`
- `Local Project` (`generic-project`)

The Settings tab stores configuration in the server `settings` table under namespaced keys:
- `integration:archon`
- `integration:generic-project`

## Graduation Flow

1. User opens an idea that is ready to graduate.
2. Client requests `GET /api/integrations` (optionally with `ideaId` for readiness).
3. User configures integration roots in Settings if needed.
4. Client calls `POST /api/integrations/:id/graduate/:ideaId`.
5. Server integration creates scaffolded files in the target location.
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

## Integration Implementations

### Archon (`server/src/integrations/archon.ts`)

Config fields:
- `archonRoot` (default `~/Projects/Archon`)
- `projectRoot` (default `<archonRoot>/projects`)

Behavior:
- validates Archon root exists
- scaffolds project files
- writes Archon context files including `.archon/seedbank.json`

### Local Project (`server/src/integrations/genericProject.ts`)

Config fields:
- `projectRoot` (default `~/Projects/Seedbank-Graduated`)

Behavior:
- creates a standalone scaffold in local project root
- chooses target stage based on category helper logic

## Continue With Agent Handoff

After graduation, the UI can launch "Continue with agent" using the returned `path` from graduation.

The backend enforces that continue-mode agent runs (`POST /api/agents/runs` with `projectPath`) are constrained to configured integration roots:
- Archon `projectRoot`
- Archon `<archonRoot>/projects`
- Generic project `projectRoot`

If `projectPath` is outside configured roots, the run is rejected.

## Safety Expectations

Integrations should:
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
