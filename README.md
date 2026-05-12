# 🌱 Seedbank
> A permanent idea vault that helps rough project sparks survive, grow, and graduate into real work.

## What is Seedbank?

Seedbank is a **local-first, single-user app** you run on your own computer. It is not a hosted service or a SaaS product — your data never leaves your machine unless you explicitly export it or configure an AI provider.

Ideas are stored in a local SQLite database (`<seedbank-data-dir>/seedbank.db`). SQLite is the durable source of truth. Browser storage (IndexedDB) is used as a read-through cache for fast loads, an offline fallback when the server is unreachable, and a migration path for any ideas created before the backend was available. If you clear browser storage, your ideas are safe in the database.

The app is built around the way ideas actually mature. A seed can start as a title and a messy paragraph, then gain a pitch, hook, risks, tech-stack notes, links, related ideas, scores, and version history. When an idea is ready, Seedbank can graduate it into a project scaffold via an adapter plugin.

Seedbank also includes AI-assisted development. The AI is deliberately framed as a thinking partner: it asks questions, reflects patterns, runs health checks, and helps scope ideas down. It does not try to replace your taste or generate a pile of generic ideas.

## Screenshots

Real app surfaces captured with deterministic demo data:

![Garden overview showing seeded ideas and filters](docs/assets/screenshots/garden-overview.jpg)
![Idea detail with Thinking Partner opened](docs/assets/screenshots/idea-detail-thinking-partner.jpg)
![Theme settings with ten live-switchable themes](docs/assets/screenshots/settings-theme.jpg)
![In-app manual overlay opened from the header](docs/assets/screenshots/manual-help-overlay.jpg)
![Dark theme view using Woad](docs/assets/screenshots/theme-dark-view.jpg)
![Mid-depth theme view using Hearth](docs/assets/screenshots/theme-mid-view.jpg)

## Quick Start

Prerequisites:

- Node.js 18+
- npm

```bash
git clone https://github.com/ghreprimand/Seedbank.git
cd Seedbank
npm install
npm start
```

Open `http://localhost:5173`.

The API server runs on `http://localhost:4800`.

Manage the local instance:

```bash
npm run status   # show URL, API, pid, and log path
npm run logs     # tail launcher log output
npm stop         # stop both server and client
```

If port `5173` is occupied, the launcher will pick the next free client port. Override defaults with `SEEDBANK_CLIENT_PORT` and `SEEDBANK_SERVER_PORT`.

## Features

- **Persistent SQLite storage** — ideas live in `<seedbank-data-dir>/seedbank.db`, not only in browser storage.
- **Version history** — meaningful edits create snapshots that can be inspected and restored.
- **AI thinking partner** — chat, field suggestions, organic prompt modes, health checks, and archive insights.
- **Ten runtime themes** — Paper, Chalk, Meadow, Dusk (light), Hearth, Rainwash (mid-depth), and Woad, Moss, Peat, Canopy (dark); switchable live from Settings → Theme, with system dark/light auto-pairing (Paper ↔ Peat).
- **Settings page** — a permanent `/settings` home for every configuration option: AI providers, agents, theme, API tokens, webhooks, backups, integrations, and app info.
- **Personal access tokens** — generate scoped bearer tokens (`read:ideas`, `write:ideas`, `ai:suggest`) for local scripting. Tokens are hashed at rest; creation is localhost-only.
- **Outbound webhooks** — fire a JSON payload to any URL on `idea.created`, `idea.graduated`, or `idea.shipped`. Useful for Zapier, n8n, or local automation.
- **Read-only MCP endpoints** — `/api/mcp/ideas` and `/api/mcp/search` expose seeds as context for external Claude or Codex sessions; token-gated.
- **OpenAPI spec** — machine-readable at `/api/openapi.json`; browsable from Settings → API & Server.
- **Local CLI agent runs** — link a Claude Code or Codex CLI binary in Settings → AI & Agents; launch a sandboxed "Develop with agent" run from any idea. Transcript streamed live; proposed files reviewed and accepted before anything is saved. Runtime capped; kill switch always present.
- **Project graduation** — turn a mature idea into an external project scaffold via integration adapters.
- **Import/export** — full archive export to JSON or Markdown, plus import from Seedbank archives and Markdown.
- **Compost bin** — deleted ideas are soft-deleted, recoverable for 30 days, then purged.
- **Auto-backups** — scheduled SQLite backups and JSON archive exports under `<seedbank-data-dir>/`.

## Platform Setup

### Linux

Run from a terminal:

```bash
npm start
```

For a desktop launcher, install `scripts/seedbank.desktop`:

```bash
bash scripts/install-desktop.sh
```

This launcher runs `scripts/seedbank start` from your cloned repository.

For auto-start, create a user systemd service that runs the launcher script from the repository root after login.

Example service shape:

```ini
[Service]
WorkingDirectory=/path/to/Seedbank
ExecStart=/usr/bin/bash /path/to/Seedbank/scripts/seedbank start
ExecStop=/usr/bin/bash /path/to/Seedbank/scripts/seedbank stop
Restart=on-failure
```

### macOS

Run from Terminal:

```bash
npm start
```

For an app-like launcher, create an Automator Application or Shortcuts workflow that runs a shell script:

```bash
cd /path/to/Seedbank
bash scripts/seedbank start
```

You can then pin that wrapper to the Dock. Use `bash scripts/seedbank stop` to stop background processes.

### Windows

Use one of the native launcher scripts from PowerShell or Command Prompt:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/seedbank.ps1 start
```

```bat
scripts\seedbank.bat start
```

Status and stop:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/seedbank.ps1 status
powershell -ExecutionPolicy Bypass -File scripts/seedbank.ps1 stop
```

```bat
scripts\seedbank.bat status
scripts\seedbank.bat stop
```

For a launcher shortcut, point Start Menu/Desktop shortcuts at either script with `start`.

## Packaging Roadmap

Seedbank is currently distributed as a local source checkout with launcher scripts (`npm start` or `scripts/seedbank*`).

Near-term deliverables:

- `npx`/global CLI wrapper for `start|stop|status|logs` around the same local runtime model.
- Container image for trusted local/LAN self-hosting, with explicit storage volume mapping for `<seedbank-data-dir>`.
- Installable release archives that bundle launcher scripts and setup guidance per platform.

Deferred packaging:

- Full desktop bundles (Tauri/Electron) are intentionally deferred. They would require native signing/notarization, auto-update strategy, and consistent cross-platform packaging CI.
- Public internet hosting is not a default target; any remote exposure needs additional auth, TLS, and network hardening beyond current defaults.

## Architecture

```text
Seedbank
├── client/   → React 19 + Vite + Tailwind CSS
├── server/   → Express + SQLite via better-sqlite3
└── shared/   → TypeScript domain types shared by both packages
```

Data flow:

```text
Browser UI ↔ REST API ↔ SQLite (<seedbank-data-dir>/seedbank.db)
     │
     └── IndexedDB via Dexie for cache and offline fallback
```

The root workspace runs both apps with one command. The client is intentionally thin: it calls the REST API first and falls back to Dexie when the backend is unavailable.

## Configuration

### Data Storage

Seedbank stores durable data in:

```text
<seedbank-data-dir>/
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

Graduation integrations live in `server/src/integrations/`. Seedbank is adapter-driven: the built-in generic local adapter works out of the box. Optional custom adapters can target specific local tools or external project workflows — implement the `Integration` interface, register in the registry, and graduate ideas to any local path. A graduated idea stores its destination in `graduatedTo` and advances stage automatically.

See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for the plugin interface and implementation steps.

## API Reference

Full REST reference with request/response shapes, token auth, and webhook payloads: **[docs/API.md](docs/API.md)**.

Machine-readable OpenAPI spec: `GET /api/openapi.json`. The same spec is browsable from **Settings → API & Server → View API reference** inside the running app.

Quick endpoint groups: ideas, versions, integrations, AI (chat, suggest, usage), settings, tokens, webhooks, MCP, agents, backups, export/import, health. See `docs/API.md` for the full list.

## Documentation

| Document | Contents |
|----------|----------|
| [docs/SETTINGS.md](docs/SETTINGS.md) | Every Settings tab explained — what's stored where, offline behavior, server vs localStorage. |
| [docs/THEMING.md](docs/THEMING.md) | Token model, the ten themes, dark-mode scale inversion, custom theme authoring. |
| [docs/API.md](docs/API.md) | Full REST reference — endpoint list, token auth, webhook payloads, MCP surface. |
| [docs/AGENTS.md](docs/AGENTS.md) | Claude Code / Codex CLI linkage, "Develop with agent" and "Continue with agent" surfaces, safety rails, transcript storage. |
| [docs/AI_GUIDE.md](docs/AI_GUIDE.md) | Thinking Partner posture, provider setup, prompt modes, field suggestions, usage readout. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagram, data-flow, settings store, token middleware, theme tokens, agent runner. |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | Graduation adapter interface, built-in adapters, and "Continue with agent" handoff. |

## Security and Hosting

Seedbank is designed for **single-user, local use only**. It is not a multi-user hosted application and does not implement user accounts or session authentication for browser clients on a shared host.

- **Default binding:** `localhost` / `127.0.0.1`. The CORS policy blocks non-loopback origins. Port `4800` is not intended to be exposed to the public internet.
- **Do not expose the API publicly** without adding a reverse-proxy that enforces authentication and TLS. Seedbank API access from `localhost` does not require a bearer token by design; public exposure without a proxy would give unauthenticated access to your ideas and data.
- **API tokens** provide scoped bearer access for local scripting. Token creation is restricted to `localhost` browser sessions even if you hold a valid token.
- **Data:** all idea content stays on your machine. AI features send idea content to your configured AI provider (OpenAI/Anthropic/Ollama). With Ollama, nothing leaves your machine.

For trusted LAN or self-hosted access, place a reverse proxy (nginx, Caddy) in front of port `4800` with HTTP basic auth or mutual TLS, and similarly protect port `5173`.

## Development

```bash
npm run dev        # client + server, hot reload (dev mode)
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
