# 🌱 Seedbank
> A permanent idea vault that helps rough project sparks survive, grow, and graduate into real work.

## What is Seedbank?

Seedbank is a personal project-idea system for people who collect more sparks than they can build immediately. It gives each idea a durable home: not a throwaway note, not a browser tab, and not a fragile IndexedDB-only sketchpad. Ideas are stored in a local SQLite database, backed up automatically, and still cached in the browser for a graceful offline fallback.

The app is built around the way ideas actually mature. A seed can start as a title and a messy paragraph, then gain a pitch, hook, risks, tech-stack notes, links, related ideas, scores, and version history. When an idea is ready, Seedbank can graduate it into a project scaffold through integration plugins.

Seedbank also includes AI-assisted development. The AI is deliberately framed as a thinking partner: it asks questions, reflects patterns, runs health checks, and helps scope ideas down. It does not try to replace the user's taste or generate a pile of generic ideas.

## Quick Start

Prerequisites:

- Node.js 18+
- npm

```bash
git clone https://github.com/ghreprimand/Seedbank.git
cd Seedbank
npm install
npm run dev
```

Open `http://localhost:5173`.

The server runs on `http://localhost:4800`. If Vite finds `5173` occupied, it will print the next available client port.

## Features

- **Persistent SQLite storage** — ideas live in `~/.seedbank/seedbank.db`, not only in browser storage.
- **Version history** — meaningful edits create snapshots that can be inspected and restored.
- **AI thinking partner** — chat, field suggestions, organic prompt modes, health checks, and archive insights.
- **Six runtime themes** — Paper, Parchment, Meadow, Dusk, Loam, and Moss; switchable live from Settings → Theme, with system dark/light auto-pairing.
- **Settings page** — a permanent `/settings` home for every configuration option: AI providers, agents, theme, API tokens, webhooks, backups, integrations, and app info.
- **Personal access tokens** — generate scoped bearer tokens (`read:ideas`, `write:ideas`, `ai:suggest`) for local scripting. Tokens are hashed at rest; creation is localhost-only.
- **Outbound webhooks** — fire a JSON payload to any URL on `idea.created`, `idea.updated`, `idea.graduated`, or `idea.shipped`. Useful for Zapier, n8n, or local automation.
- **Read-only MCP endpoints** — `/api/mcp/ideas` and `/api/mcp/search` expose seeds as context for external Claude or Codex sessions; token-gated.
- **OpenAPI spec** — machine-readable at `/api/openapi.json`; browsable from Settings → API & Server.
- **Local CLI agent runs** — link a Claude Code or Codex CLI binary in Settings → AI & Agents; launch a sandboxed "Develop with agent" run from any idea. Transcript streamed live; proposed files reviewed and accepted before anything is saved. Runtime capped; kill switch always present.
- **Project graduation** — turn a mature idea into an Archon or generic local project scaffold.
- **Import/export** — full archive export to JSON or Markdown, plus import from Seedbank archives and Markdown.
- **Compost bin** — deleted ideas are soft-deleted, recoverable for 30 days, then purged.
- **Auto-backups** — scheduled SQLite backups and JSON archive exports under `~/.seedbank/`.

## Platform Setup

### Linux

Run from a terminal:

```bash
npm run dev
```

For a desktop launcher, use or adapt a helper such as `scripts/install-desktop.sh` that starts `npm run dev` in the project directory and opens the printed Vite URL. For auto-start, create a user systemd service that runs `npm run dev` from the repository root after login.

Example service shape:

```ini
[Service]
WorkingDirectory=/home/you/Projects/Seedbank
ExecStart=/usr/bin/npm run dev
Restart=on-failure
```

### macOS

Run from Terminal:

```bash
npm run dev
```

For an app-like launcher, create an Automator Application or Shortcuts workflow that runs a shell script:

```bash
cd ~/Projects/Seedbank
npm run dev
```

You can then pin that wrapper to the Dock and open the Vite URL in your browser.

### Windows

Run from Command Prompt or PowerShell:

```powershell
npm run dev
```

For a launcher, create a `.bat` or `.ps1` file that changes into the Seedbank directory and runs `npm run dev`, then create a Start Menu shortcut to that file.

PowerShell example:

```powershell
Set-Location "$HOME\Projects\Seedbank"
npm run dev
```

## Architecture

```text
Seedbank
├── client/   → React 19 + Vite + Tailwind CSS
├── server/   → Express + SQLite via better-sqlite3
└── shared/   → TypeScript domain types shared by both packages
```

Data flow:

```text
Browser UI ↔ REST API ↔ SQLite (~/.seedbank/seedbank.db)
     │
     └── IndexedDB via Dexie for cache and offline fallback
```

The root workspace runs both apps with one command. The client is intentionally thin: it calls the REST API first and falls back to Dexie when the backend is unavailable.

## Configuration

### Data Storage

Seedbank stores durable data in:

```text
~/.seedbank/
├── seedbank.db
├── backups/
└── exports/
```

On server startup, the current database is copied into `backups/` and the newest 10 database backups are retained. The backup UI can run manual backups and configure scheduled backups as daily, weekly, or off. When JSON export backups are enabled, full archive snapshots are written to `exports/`.

The first time the backend is available, the client can migrate existing browser IndexedDB ideas into SQLite while preserving IDs, timestamps, and versions.

### AI Setup

Seedbank supports:

- OpenAI
- Anthropic
- Ollama for local models

Provider settings are configured in **Settings → AI & Agents**. API keys are stored server-side; public config responses only expose whether a key exists, not the key itself. To link a local CLI agent (Claude Code or Codex CLI), point Seedbank at the binary path in the same tab.

AI features include the Thinking Partner chat, contextual field suggestions, What If, Devil's Advocate, Scope Down, User Story, Idea Health Check, Smart Cross-Pollinate, and Pattern Insights. See [docs/AI_GUIDE.md](docs/AI_GUIDE.md).

### Integrations

Graduation integrations live in `server/src/integrations/`. The included integrations can create Archon projects or generic local scaffolds. A graduated idea stores its destination in `graduatedTo` and advances stage automatically.

See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for the plugin interface and implementation steps.

## API Reference

Full REST reference with request/response shapes, token auth, and webhook payloads: **[docs/API.md](docs/API.md)**.

Machine-readable OpenAPI spec: `GET /api/openapi.json`. The same spec is browsable from **Settings → API & Server → View API reference** inside the running app.

Quick endpoint groups: ideas, versions, integrations, AI (chat, suggest, usage), settings, tokens, webhooks, MCP, agents, backups, export/import, health. See `docs/API.md` for the full list.

## Documentation

| Document | Contents |
|----------|----------|
| [docs/SETTINGS.md](docs/SETTINGS.md) | Every Settings tab explained — what's stored where, offline behavior, server vs localStorage. |
| [docs/THEMING.md](docs/THEMING.md) | Token model, the six themes, dark-mode scale inversion, custom theme authoring. |
| [docs/API.md](docs/API.md) | Full REST reference — endpoint list, token auth, webhook payloads, MCP surface. |
| [docs/AGENTS.md](docs/AGENTS.md) | Claude Code / Codex CLI linkage, "Develop with agent" and "Continue with agent" surfaces, safety rails, transcript storage. |
| [docs/AI_GUIDE.md](docs/AI_GUIDE.md) | Thinking Partner posture, provider setup, prompt modes, field suggestions, usage readout. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagram, data-flow, settings store, token middleware, theme tokens, agent runner. |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | Graduation plugin interface, Archon and generic integrations, "Continue with agent" handoff. |

## Development

```bash
npm run dev        # client + server
npm run build      # build client and server
npm run typecheck  # typecheck client and server
npm run lint       # lint client
```

Project structure:

- `client/src/pages/` — route-level screens.
- `client/src/components/` — reusable UI and workflow components.
- `client/src/api/client.ts` — browser API client with Dexie fallback.
- `client/src/db/` — IndexedDB cache/fallback implementation.
- `server/src/index.ts` — Express routes.
- `server/src/repository.ts` — SQLite data access.
- `server/src/ai/` — provider abstraction, streaming, config, and usage tracking.
- `server/src/integrations/` — graduation plugins.
- `shared/types.ts` — cross-package domain types.

To add an integration, implement the `Integration` interface, register it in the integration registry, add any needed configuration keys, and expose readiness checks that explain what an idea needs before graduation.

## License

MIT
