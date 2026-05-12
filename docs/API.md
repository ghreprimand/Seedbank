# API Reference

Seedbank exposes a local-first REST API from the server package (`server/src/index.ts`) on `http://localhost:4800` by default.

Source of truth:
- Route behavior: `server/src/index.ts`
- Auth rules: `server/src/middleware/auth.ts`
- OpenAPI document: `GET /api/openapi.json` (generated from `server/src/openapi.ts`)

## Authentication and Authorization

### Local implicit session

Requests from loopback addresses (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) are accepted without a bearer token.

### Bearer token mode

If `Authorization: Bearer <token>` is present, Seedbank authenticates with personal access tokens from `api_tokens`.

- Token values use `sbk_<random>` format.
- Only token hashes are stored (`sha256`) in SQLite.
- Token-bearing requests are scope-checked.

### Non-loopback behavior

Requests without bearer tokens from non-loopback addresses are rejected with `401 Authentication required`.

### Scope model

Supported scopes:
- `read:ideas`
- `write:ideas`
- `ai:suggest`
- `mcp:read`
- `agents:run`

Loopback implicit-local requests bypass scope checks. Bearer requests are deny-by-default if required scope is missing.

### Token creation security

`POST /api/tokens` requires both:
- `write:ideas` scope
- implicit local session (`requireImplicitLocal`)

This prevents token chaining from bearer-authenticated sessions.

## Common Behavior

- JSON request/response unless noted.
- Global error handler returns `{ "error": "..." }` with status `500` for uncaught errors.
- Timestamps are ISO strings.

## Health and Spec

### `GET /api/health`

Returns server liveness and bound API port.

Response:

```json
{ "ok": true, "port": 4800 }
```

### `GET /api/openapi.json`

Returns the generated OpenAPI 3.1 document.

## Settings and Server Surface

### `GET /api/settings` (`read:ideas`)

Returns aggregate settings used by the Settings page.

High-level shape:

```json
{
  "ui": { "theme": { "name": "paper", "matchSystem": false } },
  "ai": {
    "provider": "openai",
    "openaiModel": "gpt-4o",
    "anthropicModel": "claude-opus-4-5",
    "ollamaModel": "llama3.2",
    "ollamaBaseUrl": "http://localhost:11434",
    "dailyTokenBudget": 50000,
    "hasOpenAIKey": false,
    "hasAnthropicKey": false
  },
  "api": {
    "tokens": [],
    "webhooks": { "url": null, "events": [] }
  },
  "agents": {
    "claudeLinked": false,
    "codexLinked": false
  },
  "backups": { "config": { "frequency": "daily", "exportJson": true } },
  "integrations": [],
  "server": {
    "port": 4800,
    "version": "2.1.0",
    "uptimeMs": 12345,
    "dbPath": "<seedbank-data-dir>/seedbank.db"
  }
}
```

### `PATCH /api/settings/:section` (`write:ideas`)

Supported sections:
- `ui`
- `ai`
- `api`
- `agents`
- `backups`

Unsupported section values return `400`.

#### `ui`

Body:

```json
{ "theme": { "name": "loam", "matchSystem": false } }
```

Rules:
- `name` must be one of `paper|parchment|meadow|dusk|loam|moss`.

#### `ai`

Body mirrors AI config patch fields (provider/models/keys/budget). Keys stay server-side; public responses only expose `hasXKey` booleans.

#### `api`

Body:

```json
{
  "webhooks": {
    "url": "https://example.com/seedbank-events",
    "events": ["idea.created", "idea.graduated", "idea.shipped"]
  }
}
```

Rules:
- URL must be `http://` or `https://`.
- `events` must be a subset of supported webhook events.
- `tokens` cannot be patched here (`400`); use `/api/tokens` endpoints.

#### `agents`

Body supports:
- `claudeCliPath`
- `codexCliPath`
- `runtimeCapMinutes` (clamped `1..30`)
- `dailyRunBudget` (minimum `1`)

#### `backups`

Body supports:
- `config.frequency`: `off|daily|weekly`
- `config.exportJson`: boolean

### `GET /api/server/info` (`read:ideas`)

Returns runtime metadata:
- `port`
- `version`
- `uptimeMs`
- `dbPath`

## Personal Access Tokens

### `GET /api/tokens` (`write:ideas`)

Returns token metadata only (never raw token values):

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "n8n-local",
      "scopes": ["mcp:read"],
      "createdAt": "2026-05-12T00:00:00.000Z",
      "lastUsedAt": null
    }
  ]
}
```

### `POST /api/tokens` (`write:ideas` + implicit local)

Body:

```json
{
  "name": "automation",
  "scopes": ["read:ideas", "mcp:read"]
}
```

Response (`201`) includes one-time token plaintext:

```json
{
  "id": "uuid",
  "name": "automation",
  "scopes": ["read:ideas", "mcp:read"],
  "createdAt": "2026-05-12T00:00:00.000Z",
  "lastUsedAt": null,
  "token": "sbk_..."
}
```

### `DELETE /api/tokens/:id` (`write:ideas`)

Revokes token metadata/hash. Returns `204` on success, `404` if not found.

## Webhooks

Supported events:
- `idea.created`
- `idea.graduated`
- `idea.shipped`

Delivery behavior (`server/src/webhooks.ts`):
- POST JSON with headers:
  - `Content-Type: application/json`
  - `X-Seedbank-Event: <event>`
  - `User-Agent: seedbank-webhook/<version>`
- 5s timeout per delivery
- redirects disabled (`redirect: 'error'`)
- bounded queue depth (500), drops oldest when full
- no HMAC signature in v1

Payload shape:

```json
{
  "event": "idea.created",
  "occurredAt": "2026-05-12T00:00:00.000Z",
  "payload": { "id": "...", "title": "..." }
}
```

## MCP Endpoints (Read-only)

All MCP routes require `mcp:read` when bearer-authenticated.

### `GET /api/mcp/ideas`

Query:
- `limit` (default 50, max 200)
- `offset` (default 0)
- `stage` (optional)
- `category` (optional)

Returns compact summaries:

```json
{
  "items": [
    {
      "id": "...",
      "title": "...",
      "pitch": "...",
      "hook": "...",
      "stage": "seed",
      "category": "tool",
      "score": 3.5,
      "updatedAt": "..."
    }
  ],
  "total": 10,
  "limit": 50,
  "offset": 0
}
```

### `GET /api/mcp/ideas/:id`

Returns:
- full idea
- rendered markdown document sections
- attachments as path list

### `GET /api/mcp/search`

Query:
- `q` (required for non-empty results)
- `limit` (default 50, max 200)

Returns compact summary matches.

## Agent Runner Endpoints

All routes below require `agents:run` for bearer-authenticated requests.

### `POST /api/agents/link`

Body:

```json
{ "provider": "claude", "cliPath": "/usr/local/bin/claude" }
```

- Validates by invoking `<cli> --version` server-side.
- Stores link details in `agents.config`.
- Browser never receives raw credentials.

Response:

```json
{
  "claudeLinked": true,
  "codexLinked": false,
  "claudeVersion": "...",
  "codexVersion": null
}
```

### `DELETE /api/agents/link/:provider`

Unlinks one provider (`claude` or `codex`). Returns same public link shape.

### `POST /api/agents/runs`

Body:

```json
{
  "provider": "codex",
  "prompt": "Build the first scaffold",
  "ideaId": "uuid"
}
```

Modes:
- Scratch mode: provide `ideaId`, omit `projectPath`.
- Continue mode: provide `projectPath` (must be inside configured integration roots), optional `ideaId`.

Response (`202`):

```json
{ "runId": "uuid", "state": "running" }
```

### `GET /api/agents/runs/:id`

Returns run metadata and transcript:

```json
{
  "id": "uuid",
  "ideaId": "uuid",
  "projectPath": null,
  "provider": "claude",
  "state": "completed",
  "startedAt": "...",
  "endedAt": "...",
  "exitCode": 0,
  "proposedFiles": ["SPEC.md"],
  "transcript": "...",
  "truncated": false
}
```

`transcriptPath` is intentionally not exposed in the public API.

### `GET /api/agents/runs/:id/stream` (SSE)

Events:
- `state`
- `delta`
- `error`
- `done`

Behavior:
- sends current state immediately
- replays existing transcript for late subscribers
- streams live deltas while running

### `POST /api/agents/runs/:id/stop`

Requests termination (`202`). Runtime behavior:
- sends `SIGTERM`
- escalates to `SIGKILL` after 5s if still running

### `POST /api/agents/runs/:id/apply`

Body:

```json
{ "paths": ["SPEC.md", "prototype/notes.md"] }
```

Rules:
- only allowed for scratch runs (`ideaId` set, `projectPath` null)
- run must not be `running`
- each path must resolve inside scratch workspace
- symlinks and symlink traversal are blocked

Effect:
- copies selected files into `<seedbank-data-dir>/attachments/<ideaId>/<runId>/...`
- appends copied paths to `idea.images`
- does not auto-write canonical idea fields (`pitch`, `hook`, etc.)

## Core Idea Endpoints

Scope expectations (bearer mode):
- read operations: `read:ideas`
- mutating operations: `write:ideas`

### Ideas
- `GET /api/ideas`
- `GET /api/ideas/:id`
- `POST /api/ideas`
- `PATCH /api/ideas/:id`
- `DELETE /api/ideas/:id` (soft delete)

### Versions
- `GET /api/ideas/:id/versions`
- `POST /api/ideas/:id/versions`
- `POST /api/ideas/:id/versions/restore/:versionId`

### Compost
- `GET /api/compost`
- `POST /api/compost/:id/restore`
- `DELETE /api/compost/:id`

### Stats
- `GET /api/stats`

## AI Endpoints

- `GET /api/ai/config` (`read:ideas`)
- `GET /api/ai/usage` (`read:ideas`)
- `POST /api/ai/config` (`write:ideas`, legacy update route)
- `GET /api/ai/conversations/:ideaId` (`read:ideas`)
- `POST /api/ai/suggest` (`ai:suggest`)
- `POST /api/ai/chat` (`ai:suggest`, SSE)

## Backups, Integrations, Import/Export

### Backups
- `GET /api/backups` (`read:ideas`)
- `PATCH /api/backups/config` (`write:ideas`)
- `POST /api/backups/run` (`write:ideas`)

### Integrations
- `GET /api/integrations` (`read:ideas`)
- `POST /api/integrations/:id/configure` (`write:ideas`)
- `POST /api/integrations/:id/graduate/:ideaId` (`write:ideas`)

### Import/Export
- `POST /api/export` (`read:ideas`)
- `POST /api/import` (`write:ideas`)

## Known Stubs in OpenAPI

`server/src/openapi.ts` still marks these as stubs:
- `/api/ideas/{id}/attachments`
- `/api/search`

These are included for planned surface compatibility but are not currently implemented as full REST routes in `server/src/index.ts`.
