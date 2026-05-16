# Project Graduation Adapters

This guide covers the adapter system behind **Settings -> Project Graduation** and the graduation scaffold flow. Graduation is intentionally server-side because adapters write files and return project paths.

## Where To Configure Project Graduation

Project graduation settings are managed in:
- `Settings -> Project Graduation` (route remains `/settings/integrations`)

Built-in adapter:
- `Local Project` (`generic-project`) — general-purpose external project scaffold; works with any local directory and development workflow.

Optional custom adapters are registered in `server/src/integrations/registry.ts`. An adapter that is only useful for a specific private tool should not be documented here as a public feature; see [Adding a Custom Adapter](#adding-a-custom-adapter) below.

The Settings tab stores adapter configuration in the server `settings` table under namespaced keys:
- `integration:generic-project`
- `integration:<your-adapter-id>` (one key per registered adapter)

## Graduation Flow (User Task)

1. User opens an idea that is ready to graduate.
2. Client requests `GET /api/integrations` (optionally with `ideaId` for readiness checks).
3. User configures one or more integration roots in Settings.
4. Client calls `POST /api/integrations/:id/graduate/:ideaId`.
5. Server adapter creates scaffolded files in the target location.
6. Server updates idea fields:
   - `graduatedTo`
   - `stage`
7. Webhook event `idea.graduated` is emitted when configured.

## Graduation API Endpoints

- `GET /api/integrations`
- `GET /api/integrations?ideaId=<id>` (includes readiness)
- `POST /api/integrations/:id/configure`
- `POST /api/integrations/:id/graduate/:ideaId`

## GitHub Publishing (Optional, Post-Graduation)

GitHub publishing is a separate action after graduation. It does not replace local scaffolding and is never required.

Flow:
1. Idea is graduated and has a local `graduatedTo` project path.
2. User authenticates locally with GitHub CLI (`gh auth login`); local Git is preferred for commit/push, with a GitHub API upload fallback for small generated project folders.
3. Client checks account status via `GET /api/integrations/github/status`.
4. User explicitly publishes via `POST /api/integrations/github/publish/:ideaId` with:
   - `repoName`
   - optional `owner`
   - `visibility` (`public` or `private`)
   - `pushInitial` (whether to initialize/push immediately)
5. Server returns granular outcome (`repoCreated`, `pushed`, `repoUrl`, `projectPath`, message/error), so local project creation is never rolled back silently.

After a repo exists, the idea stores a `GitHub` link and the project folder has an `origin` remote. Seedbank reads live repo status with `GET /api/integrations/github/repo-status/:ideaId`; if GitHub confirms the repo still exists, the idea detail page shows the repo link and an update action instead of another create action. `POST /api/integrations/github/update/:ideaId` stages the local project folder, commits changed files when needed, configures `origin`, and pushes `main`.

Security model:
- Seedbank does not store GitHub PATs or account credentials.
- Auth state remains owned by local `gh` CLI.
- Publishing uses bounded server-side orchestration and explicit user intent.

All graduation routes are authenticated through the standard API middleware and use `read:ideas` / `write:ideas` scopes for bearer mode.

API/webhook/MCP docs now live under the **API & Automation** concept:
- Settings overview: `docs/SETTINGS.md` (`API & Server` section)
- REST and endpoint reference: `docs/API.md`

## Adapter Implementations (Developer)

### Local Project (`server/src/integrations/genericProject.ts`)

Config fields:
- `projectRoot` (external project root; set in Settings)

Behavior:
- creates a standalone scaffold in a configured external project root
- generates `README.md`, `AGENTS.md`, and a seed context file from the idea
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

## Safety Expectations

Adapters should:
- write only inside configured roots
- produce actionable starter scaffolds, not full products
- preserve idea language in generated docs where possible
- return clear `message` and `filesCreated` outputs

## Adding a Custom Adapter

1. Create a file under `server/src/integrations/`.
2. Implement `Integration` from `server/src/integrations/types.ts`.
3. Read/write config via `IntegrationConfigStore` (namespaced `integration:<id>` settings).
4. Register in `server/src/integrations/registry.ts`.
5. Verify with integration APIs and graduation flow.
