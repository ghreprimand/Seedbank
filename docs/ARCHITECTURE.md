# Architecture

Seedbank is a local-first monorepo with a durable backend. The client prefers the API and falls back to local browser storage when the API is unavailable.

## System Overview

```text
Browser (React 19 + Vite + Tailwind)
  client/src/api/client.ts
        |
        v
Express API
  server/src/index.ts
        |
        v
SQLite
  <seedbank-data-dir>/seedbank.db
```

Fallback path when API is down:

```text
Browser <-> Dexie / IndexedDB cache
```

## Monorepo Packages

- `client/` — SPA UI, settings store, API client, offline fallback cache
- `server/` — Express routes, auth, SQLite repository, AI, integrations, agent runner
- `shared/` — shared TypeScript domain types

Top-level scripts:

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
```

## Persistence Model

Primary DB tables:
- `ideas`
- `versions`
- `settings`
- `ai_*` usage/conversation tables
- `api_tokens` (`server/migrations/003_api_tokens.sql`)
- `agent_runs` (`server/migrations/004_agent_runs.sql`)

`settings` is namespaced and now includes keys such as:
- `ui.theme`
- `ai.config` (legacy `ai:config` migrated on startup)
- `api.webhooks`
- `agents.config`
- `integration:<adapter-id>` (one namespaced key per registered adapter; for example `integration:generic-project`)
- backup keys (`backup.config`, `backup.lastRun`)

## Settings Architecture

Server aggregate endpoint:
- `GET /api/settings`

Section patch endpoint:
- `PATCH /api/settings/:section`

The server composes a single aggregate payload containing:
- UI theme
- AI public config
- API webhooks and token metadata
- linked-agent public status
- backup status
- integration summaries
- server info

Client state:
- `client/src/stores/settings.ts` (Zustand)
- hydrates from `GET /api/settings`
- writes through `PATCH /api/settings/:section`
- preserves theme behavior offline via `localStorage`

## Theme Token Layer

Theme architecture is palette-only and does not require component rewrites:
- `client/src/theme/themes.css` defines per-theme `--c-*` tokens.
- `client/src/index.css` maps Tailwind semantic tokens (`--color-*`) to `--c-*` via `@theme`.
- `client/src/main.tsx` sets `data-theme` before first paint to avoid FOUC.

Result: components continue using semantic utility classes (`bg-paper`, `text-ink-800`) across all themes.

## API Security Model

Auth middleware (`server/src/middleware/auth.ts`) runs on `/api`:
- Loopback requests can use implicit local auth with no bearer token.
- Non-loopback requests must present `Authorization: Bearer <token>`.
- Bearer tokens are scoped and deny-by-default per route.

Token storage:
- plaintext token is returned once at creation
- only `sha256` hash is stored in `api_tokens`

Important hardening:
- `POST /api/tokens` requires implicit local session, preventing bearer token chaining.
- `trust proxy` is disabled in Express to reduce IP spoofing ambiguity in local-first deployments.

## OpenAPI and API Surface

`server/src/openapi.ts` builds the OpenAPI document served at:
- `GET /api/openapi.json`

This spec is the machine-readable API contract used by the in-app API reference.

## Webhook Subsystem

`server/src/webhooks.ts` delivers optional outbound events:
- `idea.created`
- `idea.graduated`
- `idea.shipped`

Delivery characteristics:
- queued async dispatch
- max queue depth 500 (drops oldest when full)
- 5 second request timeout
- redirects refused
- no HMAC signing in v1

## MCP Facade

Read-only MCP-style endpoints:
- `GET /api/mcp/ideas`
- `GET /api/mcp/ideas/:id`
- `GET /api/mcp/search`

These routes require `mcp:read` for bearer auth and are designed for external agent/tool context pulls, not mutation.

## Agent Runner Architecture

Core modules:
- `server/src/agents/link.ts` — CLI binary resolution and `--version` validation for `claude`/`codex`
- `server/src/agents/service.ts` — run lifecycle, process control, transcript streaming, safety rails
- `server/src/agents/store.ts` — `agent_runs` persistence

Execution model:
- Seedbank spawns local CLI processes (`spawn`) in either:
  - scratch workspace for idea development mode
  - graduated project path for continue mode
- environment is intentionally inherited so CLIs can discover local credentials/session.

Transcript model:
- transcript written to disk under `<seedbank-data-dir>/agent-runs/<runId>.log`
- capped at 256 KB with truncation marker
- run API exposes transcript content, not internal transcript file paths

Persistence model (`agent_runs`):
- run metadata and state
- transcript path (internal)
- proposed files JSON
- startup normalization marks orphaned `running` rows as `failed`

## Agent Safety Rails

Implemented safety controls include:
- per-run runtime cap (`runtimeCapMinutes`, max 30)
- daily run budget (`dailyRunBudget`)
- explicit stop endpoint with SIGTERM then SIGKILL escalation
- workspace root allowlist for continue mode (configured integration roots)
- scratch apply-only behavior for attachment copy flow
- no direct auto-write to canonical idea fields
- symlink traversal protections during proposed-file collection and apply

This keeps the agent role as a constrained assistant that proposes changes and requires explicit user acceptance.

## Integration Architecture

Integrations live under `server/src/integrations/` and implement a shared adapter interface. The registry currently provides:
- `generic-project` (general-purpose built-in adapter; works with any local directory)
- Optional custom adapters can be registered by implementing `Integration` from `types.ts` and adding them to `registry.ts`.

Graduation is server-side because it performs local filesystem writes and then updates idea lifecycle fields (`graduatedTo`, `stage`).

## Backup Architecture

Data directory:

```text
<seedbank-data-dir>/
├── seedbank.db
├── backups/
├── exports/
├── scratch/
├── agent-runs/
└── attachments/
```

Backup flow supports:
- scheduled daily/weekly DB copies
- manual backup runs
- optional JSON archive export

## Operational Notes

- API default port: `4800`
- Vite default port: `5173`
- SQLite uses WAL mode
- CORS is restricted to local origins (`localhost` / `127.0.0.1`)
