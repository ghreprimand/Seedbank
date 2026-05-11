# Architecture

Seedbank is a local-first monorepo with a durable backend. The app is designed to feel fast and private while avoiding the fragility of browser-only persistence.

## System Overview

```text
Browser
  React 19 + Vite + Tailwind
  client/src/api/client.ts
        │
        │ REST first
        ▼
Express API
  server/src/index.ts
  server/src/repository.ts
        │
        ▼
SQLite
  ~/.seedbank/seedbank.db
```

Fallback path:

```text
Browser ↔ Dexie / IndexedDB
```

The client always prefers the API. If the API is unreachable, it falls back to IndexedDB so the user can still read and edit local cached ideas.

## Monorepo Packages

```text
client/   React SPA, API client, Dexie fallback
server/   Express routes, SQLite repository, AI, integrations
shared/   TypeScript domain types
```

Root scripts coordinate both packages:

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
```

## Data Model

Core tables:

- `ideas` — the current idea records.
- `versions` — point-in-time snapshots of idea content.
- `settings` — user preferences, AI config, integration config, and backup metadata.
- AI conversation and usage tables are added by the AI migration.

Ideas include:

- identity fields: `id`, `title`, `pitch`
- development fields: notes, hook, why it might work, risks, tech stack
- organization fields: category, stage, tags, mood labels
- relationship fields: related ideas, links, images
- lifecycle fields: created, updated, deleted, graduated target

## REST API Boundary

The API is the durable source of truth. `client/src/api/client.ts` owns:

- request construction
- response hydration from ISO strings back into `Date`
- connection status
- cache writes into Dexie
- fallback behavior when the backend is unavailable

This keeps React components from knowing whether data came from SQLite or IndexedDB.

## Offline Fallback Strategy

Dexie is retained for two reasons:

1. Existing users may already have IndexedDB data.
2. The app should remain useful if the backend is temporarily unavailable.

On first launch with the backend available, Seedbank can migrate browser data into SQLite. The migration preserves:

- idea IDs
- created and updated timestamps
- deleted/graduated state where present
- version history

After migration, Dexie remains a cache and fallback, not the primary persistence layer.

## Soft Delete and Compost

Deleting an idea sets `deletedAt` instead of removing the row. Active list endpoints exclude deleted ideas by default.

Compost endpoints:

- list deleted ideas
- restore an idea
- permanently purge an idea

Compost uses a 30-day retention window. Expired deleted ideas are purged when the compost list is requested.

## Backup System

Seedbank stores data under:

```text
~/.seedbank/
├── seedbank.db
├── backups/
└── exports/
```

Backups include:

- startup database copy
- manual backup from the UI
- scheduled daily or weekly database backup
- optional JSON archive export

The server keeps the newest 10 database backup files. JSON exports are written to `~/.seedbank/exports/` for portable archive recovery.

## AI Architecture

The AI layer lives in `server/src/ai/`.

Responsibilities:

- provider abstraction for OpenAI, Anthropic, and Ollama
- provider configuration stored in settings
- server-side API key handling
- streaming chat endpoint
- single-shot suggestion endpoint
- conversation persistence per idea
- token usage tracking and budget checks

The browser never calls model providers directly. It sends idea context to the local Seedbank API, and the server handles provider-specific requests.

## Encryption and Key Handling

AI keys are accepted through server configuration endpoints. Public config responses expose booleans such as `hasOpenAIKey`, not raw keys.

The AI module includes a crypto helper for protecting stored secrets. In local deployments, the encryption material should be treated like any other local application secret: protect the user account and the `~/.seedbank` directory.

## Integration Architecture

Integrations live under `server/src/integrations/` and implement a common interface. The registry exposes all available integrations to the frontend.

Graduation is intentionally server-side because it may create files on disk. The browser chooses an integration; the server performs the scaffold work and updates the idea with `graduatedTo`.

## Import and Export

JSON archive format:

```json
{
  "seedbankVersion": 1,
  "exportedAt": "2026-05-11T00:00:00.000Z",
  "ideas": [],
  "versions": []
}
```

Markdown export is optimized for reading. JSON export is optimized for backup and restore.

## Operational Notes

- The API defaults to port `4800`.
- The Vite client defaults to port `5173`.
- The SQLite database uses WAL mode.
- CORS accepts local development origins.
- The server is intentionally lightweight and local-machine oriented.
