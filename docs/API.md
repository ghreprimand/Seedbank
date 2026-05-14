# API Reference

Seedbank exposes a local-first REST API from the server package (`server/src/index.ts`) on `http://localhost:4800` by default.

Source of truth:
- Route behavior: `server/src/index.ts` plus modular route registrars under `server/src/*/routes.ts`
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
  "categories": { "items": [] },
  "ai": {
    "defaultProviderInstanceId": "ollama",
    "providerInstances": {},
    "featureRoutes": {},
    "effectiveFeatureRoutes": {},
    "guardrails": {},
    "dailyTokenBudget": 200000
  },
  "api": {
    "tokens": [],
    "webhooks": { "url": null, "events": [] }
  },
  "backups": { "config": { "frequency": "daily", "exportJson": true } },
  "integrations": [],
  "server": {
    "port": 4800,
    "version": "<runtime version>",
    "uptimeMs": 12345,
    "dbPath": "<seedbank-data-dir>/seedbank.db"
  }
}
```

`ai` now uses provider-instance routing (`defaultProviderInstanceId`, `providerInstances`, `featureRoutes`, `effectiveFeatureRoutes`, `guardrails`). Legacy top-level provider/model fields remain for compatibility and defaults.

### `PATCH /api/settings/:section` (`write:ideas`)

Supported sections:
- `ui`
- `ai`
- `api`
- `backups`
- `categories`

Unsupported section values return `400`.

#### `ui`

Body:

```json
{ "theme": { "name": "woad", "matchSystem": false } }
```

Rules:
- `name` must be one of `paper|chalk|meadow|dusk|hearth|rainwash|woad|moss|peat|canopy`.

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

#### `backups`

Body supports:
- `config.frequency`: `off|daily|weekly`
- `config.exportJson`: boolean
- `config.retentionCount`: integer
- `config.destinations`: array of destination configs

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
- `GET /api/ai/providers` (`read:ideas`)
- `GET /api/ai/method-capabilities` (`read:ideas`)
- `GET /api/ai/usage` (`read:ideas`)
- `GET /api/ai/usage/detail` (`read:ideas`) - grouped usage plus recent guardrail/provider audit events
- `POST /api/ai/config` (`write:ideas`, legacy update route)
- `POST /api/ai/preflight` (`read:ideas`) - resolves feature route, budget state, allowlist blockers, and local/remote privacy metadata. Accepts optional `providerInstanceId`, `model`, `effort`, and `verbosity` to preview a temporary route override.
- `POST /api/ai/test` (`write:ideas`)
- `POST /api/ai/models` (`write:ideas`)
- `POST /api/ai/list-models` (`write:ideas`)
- `GET /api/settings/ai` (`read:ideas`)
- `POST /api/settings/ai` (`write:ideas`, legacy compatibility route)
- `GET /api/ai/claude-account/status` (`read:ideas`)
- `POST /api/ai/claude-account/login` (`write:ideas`)
- `POST /api/ai/claude-account/login/complete` (`write:ideas`)
- `POST /api/ai/claude-account/logout` (`write:ideas`)
- `GET /api/ai/codex-account/status` (`read:ideas`)
- `POST /api/ai/codex-account/login` (`write:ideas`)
- `POST /api/ai/codex-account/logout` (`write:ideas`)
- `GET /api/ai/conversations/:ideaId` (`read:ideas`)
- `POST /api/ai/suggest` (`ai:suggest`) - field suggestions accept optional `prompt`, `omitCurrentValue`, `aiConfirmationToken`, `providerInstanceId`, `model`, `effort`, and `verbosity`
- `POST /api/ai/field-chat` (`ai:suggest`, SSE) - modal-local field assistance using the `field-suggestions` route; accepts `aiConfirmationToken` plus the same optional provider/model override fields as `POST /api/ai/suggest`
- `POST /api/ai/project-draft` (`ai:suggest`) - generates reviewable project files using the `project-drafting` Feature Defaults route; accepts `ideaId`, optional `prompt`, `aiConfirmationToken`, `providerInstanceId`, `model`, `effort`, and `verbosity`
- `POST /api/ai/project-draft/apply` (`ai:suggest`) - writes selected reviewed draft files into the idea's graduated project path when it is inside a configured project root; rejects unsafe paths and existing files
- `POST /api/ai/chat` (`ai:suggest`, SSE) - Thinking Partner chat; accepts `aiConfirmationToken`

The provider/model override fields are request-scoped. They let a single AI request run against another configured provider instance without changing Settings → AI & Agents → Feature Defaults.

## Backups, Project Graduation, Import/Export

### Backups
- `GET /api/backups` (`read:ideas`)
- `PATCH /api/backups/config` (`write:ideas`)
- `POST /api/backups/run` (`write:ideas`)
- `POST /api/backups/destinations/test` (`write:ideas`)
- `POST /api/backups/test-restore` (`write:ideas`)

### Project Graduation
- `GET /api/integrations` (`read:ideas`)
- `GET /api/integrations/:id/health` (`read:ideas`)
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
