# Changelog

## 2.1.0 — Settings, API, Theming & Agents

Seedbank v2.1.0 ships four closely-related feature groups that turn scattered configuration popovers into a permanent Settings page, give the local API a real security surface, make the UI themeable at runtime, and link local AI CLI agents for sandboxed "develop with agent" runs.

### Settings foundation

- New `/settings` route with a 7-tab shell: General, AI & Agents, Theme, API & Server, Backups, Integrations, About.
- Left-rail nav on desktop, horizontal scrollable pill strip on mobile. Deep-linkable `/settings/:tab` routes.
- Gear icon in the header replaces the old Import/Export button. Import/Export moves to the General tab; keyboard shortcut preserved.
- Backup config controls move from a header popover to the Backups tab. `BackupStatus` pill becomes a status link.
- Integration configure form moves from `GraduationModal` to the Integrations tab. Graduation modal detects unconfigured integrations and links there.
- Zustand settings store hydrates from `GET /api/settings` on mount (idempotent), writes through `PATCH /api/settings/:section`, and falls back to `localStorage` + sensible defaults when offline.
- Offline banner shown on the Settings page when the server is unreachable. Mutation buttons disabled in that state.

### API & Server tab

- **Personal access tokens** — generate scoped bearer tokens (`read:ideas`, `write:ideas`, `ai:suggest`). Tokens are SHA-256 hashed at rest; creation is restricted to localhost sessions. Raw token shown once with a copy button.
- **Outbound webhooks** — configure a URL and pick events (`idea.created`, `idea.updated`, `idea.graduated`, `idea.shipped`). Payload is the full idea record.
- **Read-only MCP endpoints** — `/api/mcp/ideas` and `/api/mcp/search` expose seeds as context for external Claude or Codex sessions. Token-gated.
- **OpenAPI spec** — generated at `/api/openapi.json`; browsable from the API & Server tab.
- **Server info card** — port, version, uptime, DB path, last backup time.
- `ConnectionStatus` pill links to `/settings/api`.

### AI & Agents tab

- Provider cards for OpenAI, Anthropic, and Ollama — status pill, inline test-connection, expandable key/model/URL fields. Replaces the dense grid in the AI panel popover.
- Default-provider radio — single source of truth; the Thinking Partner panel reads this setting.
- Token budget slider with last-24 h / last-7 d usage readout (from `ai_usage` table).
- **Claude Code / Codex CLI linking** — enter the binary path; Seedbank validates with `--version` server-side and stores `agentLinked: true`. No raw credentials enter the browser.
- **"Develop with agent"** button on idea detail — opens a panel that streams the agent's run against a scratch workspace seeded with the idea's markdown context. Proposed files appear in a checklist; accepted files are saved as attachments.
- **"Continue with agent"** button on graduated ideas — hands the idea + scaffolded project directory to the agent for follow-on work.

### Theming system

- Six named themes: **Paper** (default), **Parchment**, **Meadow**, **Dusk**, **Loam** (dark), **Moss** (dark).
- Themes are runtime-switchable via CSS custom properties and `data-theme` on `<html>`. No component changes needed.
- Dark themes invert the ink scale so `text-ink-800` stays "strong body copy" in both modes.
- Theme picker in Settings → Theme: six mini-preview cards, keyboard-arrow selectable, "Match system" toggle that auto-pairs Paper ↔ Loam by `prefers-color-scheme`.
- No flash of unstyled content — theme applied in a pre-paint IIFE in `main.tsx` before `createRoot`.

### Security highlights

- API tokens hashed at rest (SHA-256 via `server/src/ai/crypto.ts` pattern); only the hash is stored.
- Token creation endpoint enforces `requireImplicitLocal` — only requests from `127.0.0.1` / `::1` / `localhost` can mint new tokens.
- Bearer-token middleware is additive: cookie-less local requests continue to work without a token.
- MCP endpoints are read-only and token-gated; they return `hasX` booleans rather than raw keys.
- CLI agent credentials stay in the OS / CLI tool's own keyring; Seedbank stores only the binary path and `agentLinked: true`.
- Agent runs are sandboxed to a per-idea scratch workspace (no access to arbitrary filesystem paths). Runtime capped at 5 min per run (30 min absolute); kill switch always visible in the UI.
- No agent output auto-writes to canonical idea fields — every proposed change flows through an explicit accept/reject step.

### Documentation

Seven docs added or refreshed: `SETTINGS.md`, `THEMING.md`, `API.md`, `AGENTS.md`, `AI_GUIDE.md`, `ARCHITECTURE.md`, `INTEGRATIONS.md`. README Features list and API Reference section updated; full Documentation table added.

---

## 2.0.0 — Permanent Idea Vault

Seedbank v2.0.0 turns the original browser-only idea sketchpad into a durable local application with a persistent backend, AI-assisted development, project graduation, recoverable delete, and automatic backups.

### Added

- **Monorepo workspace** with `client`, `server`, and `shared` packages.
- **Express API server** on port `4800`.
- **SQLite persistence** via `better-sqlite3` at `~/.seedbank/seedbank.db`.
- **Shared TypeScript domain types** used by both client and server.
- **REST API** for ideas, versions, stats, import/export, compost, backups, integrations, and AI.
- **Frontend API client** that uses the backend first and Dexie/IndexedDB as offline cache and fallback.
- **One-time browser data migration** from IndexedDB into SQLite.
- **Soft delete / Compost** with restore, purge, and 30-day retention.
- **Automatic backups** with startup database backups, scheduled daily/weekly backups, manual backup, and JSON archive exports.
- **Project graduation framework** with plugin-style integrations.
- **Archon integration** for creating project folders and context files.
- **Generic project scaffold integration** for local project creation without Archon.
- **Graduation UI** with readiness checks and post-graduation badges.
- **AI service layer** with OpenAI, Anthropic, and Ollama provider support.
- **Streaming AI chat** endpoint for per-idea Thinking Partner conversations.
- **AI field suggestions** for pitch, risks, tech stack, hook, and why-it-might-work fields.
- **Organic AI prompt modes**: What If, Devil's Advocate, Scope Down, and User Story.
- **Idea Health Check** with field-by-field readiness feedback.
- **Smart Cross-Pollinate** and **Pattern Insights** on the Discover page.
- **Public showcase documentation** in `README.md`, `CONTRIBUTING.md`, and `docs/`.

### Changed

- Ideas now survive browser storage clears because SQLite is the durable source of truth.
- The client data layer no longer talks directly to Dexie from UI components.
- Delete actions now move ideas to Compost instead of immediately removing them.
- Export/import can operate through the server API while preserving local fallback behavior.
- README now documents setup, platform notes, architecture, configuration, API groups, and development workflow.

### Data and Migration

- Existing IndexedDB data can be migrated into SQLite while preserving IDs, timestamps, and version history.
- SQLite startup backups keep the latest 10 `.db` copies.
- Scheduled JSON exports are written to `~/.seedbank/exports/`.

## 1.0.0 — Initial Release

Seedbank v1.0.0 was a local-first project idea manager built with React, TypeScript, and IndexedDB.

### Features

- Quick "Plant a Seed" flow with title and notes.
- 14-field editor for pitch, notes, hook, risks, tech stack, tags, scores, related ideas, links, and images.
- Board view with search, filters, and sorting.
- Gardening lifecycle stages from Seed to Shipped.
- Debounced auto-save to IndexedDB.
- Automatic version snapshots and restore.
- Discovery tools: Daily Seed, Cross-Pollinate, Draw from Storage, and Idea Weather.
- JSON and Markdown import/export.
- Keyboard shortcuts for capture and search.
- Responsive UI with custom paper/sage/ink/clay theme.
