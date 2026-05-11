# Seedbank

Seedbank is a permanent idea vault for project seeds: games, apps, tools, art projects, local AI experiments, and open-source utilities. It keeps the fast React editor from the original app, but data now lives in a durable SQLite database behind a local Node.js API.

## Architecture

Seedbank is a TypeScript monorepo:

```text
.
├── client/          React 19 + Vite SPA
├── server/          Express API + SQLite persistence
└── shared/          Shared domain types
```

The client talks to the server at `http://localhost:4800`. IndexedDB/Dexie remains as an offline cache and fallback, but the durable source of truth is `~/.seedbank/seedbank.db`.

## Features

- Persistent idea storage in SQLite with startup backups.
- Full idea editor with pitch, notes, hook, risks, tech stack, tags, scores, links, related ideas, and version history.
- REST API for ideas, versions, import/export, integrations, AI suggestions, backups, and compost recovery.
- One-time browser-data migration from IndexedDB into SQLite.
- Project graduation through integration plugins.
- AI-assisted discovery and organic thinking prompts.
- Compost bin for recoverable soft-deleted ideas.
- JSON and Markdown archive import/export.

## Setup

Install dependencies from the workspace root:

```bash
npm install
```

Start both the client and server:

```bash
npm run dev
```

Default ports:

- Client: `http://localhost:5173`
- Server: `http://localhost:4800`

If Vite finds `5173` occupied it will choose the next available port.

## Data Storage

The server stores data under `~/.seedbank/`:

```text
~/.seedbank/
├── seedbank.db
├── backups/
└── exports/
```

On startup, the server copies the current database into `backups/` and keeps the newest 10 database backups. The backup UI can also run a manual backup and configure scheduled backups as daily, weekly, or off. When JSON export backup is enabled, archives are written to `~/.seedbank/exports/`.

## API Overview

Core endpoints:

- `GET /api/ideas`
- `GET /api/ideas/:id`
- `POST /api/ideas`
- `PATCH /api/ideas/:id`
- `DELETE /api/ideas/:id`
- `GET /api/ideas/:id/versions`
- `POST /api/ideas/:id/versions`
- `POST /api/ideas/:id/versions/restore/:versionId`
- `GET /api/stats`
- `POST /api/export`
- `POST /api/import`
- `GET /api/compost`
- `POST /api/compost/:id/restore`
- `DELETE /api/compost/:id`
- `GET /api/backups`
- `PATCH /api/backups/config`
- `POST /api/backups/run`

## Integration Plugins

Server integrations live in `server/src/integrations/`. Each plugin implements:

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

Available integration endpoints:

- `GET /api/integrations`
- `POST /api/integrations/:id/configure`
- `POST /api/integrations/:id/graduate/:ideaId`

The included Archon integration creates a project directory with generated project context files. The generic project integration creates a local scaffold in a configured project root.

## AI Configuration

AI features call:

- `POST /api/ai/suggest`
- `POST /api/ai/chat` when the full chat provider layer is enabled

The current UI uses `suggest` for:

- Smart Cross-Pollinate on the Discover page.
- Pattern Insights across the archive.
- Idea Health Check.
- Organic prompt modes: What if, Devil's Advocate, Scope Down, and User Story.

Provider credentials and model settings are intended to live in the `settings` table. The UI degrades to local, non-network prompts when the AI backend is unavailable.

## Scripts

```bash
npm run dev        # client + server
npm run build      # build client and server
npm run typecheck  # typecheck client and server
npm run lint       # lint client
```

## Import And Export

Archive JSON contains all ideas and versions:

```json
{
  "seedbankVersion": 1,
  "exportedAt": "2026-05-11T00:00:00.000Z",
  "ideas": [],
  "versions": []
}
```

Markdown export produces a readable document with one section per idea. JSON is the recommended full-fidelity backup format.
