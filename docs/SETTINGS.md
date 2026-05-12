# Settings

Seedbank's Settings page lives at `/settings` and is the single place to configure providers, theming, tokens, backups, integrations, and more. Access it via the gear icon (⚙) in the top-right header, or navigate directly to any tab with a deep link.

## Navigation

Settings uses a tabbed shell. On desktop (`md+`) a left-rail sidebar lists every tab; on mobile a horizontally-scrollable pill strip appears above the content area. Tabs are deep-linkable — bookmarking `/settings/ai-agents` opens that tab directly. An unknown tab segment redirects to **General**.

| Tab | Path | Purpose |
|-----|------|---------|
| General | `/settings/general` | Import / export, keyboard shortcut reference |
| AI & Agents | `/settings/ai-agents` | Provider config, agent linking, token budget |
| Theme | `/settings/theme` | Color palette, system preference toggle |
| API & Server | `/settings/api` | Server info, personal access tokens, webhooks, MCP |
| Backups | `/settings/backups` | Backup schedule, path, manual run |
| Integrations | `/settings/integrations` | Archon and generic project root configuration |
| About | `/settings/about` | Version, GitHub link, acknowledgements |

The header API-status pill (top-right, next to the gear icon) is now a link that jumps to **API & Server** when clicked.

---

## General

- **Import / Export** — the import/export modal is launched here (previously in the header). The keyboard shortcut still works from any page.
- **Shortcuts reference** — a static table of keyboard shortcuts available throughout the app.

---

## AI & Agents

Replaces the settings popover that used to live inside the inline AI chat panel.

### Provider cards

Three provider cards appear in a column: **OpenAI**, **Anthropic**, and **Ollama**. Each shows:

- A status pill: `connected` (key stored), `key needed`, `unreachable`, or `local`.
- The configured model name.
- A **Set default** button (radio-like) to choose which provider the Thinking Partner uses.
- An expandable details row for model, API key, and (Ollama only) base URL.

The default provider is stored server-side and read by the Thinking Partner panel on every idea detail page. You no longer configure the provider from within the chat panel itself.

**Keys are never exposed to the browser.** The public settings response includes `hasOpenAIKey` / `hasAnthropicKey` booleans only. Keys are stored server-side in the `settings` table.

### Token budget & usage

A daily token limit input controls how many tokens Seedbank's AI features can consume in a 24-hour window. Below the input a mono-styled readout shows tokens used in the last 24 hours and last 7 days, drawn from the `ai_usage` table.

### Agents

Two agent cards appear here — **Claude Code** and **Codex CLI**. Each card lets you:

1. Enter an explicit path to the CLI binary (e.g. `/usr/local/bin/claude`), or leave it blank and click the detect button to find the binary on `$PATH`.
2. Link the agent — the server runs `<cli> --version` to validate. Version is stored server-side; no credentials enter the browser.
3. Unlink at any time.

See [`docs/AGENTS.md`](./AGENTS.md) for the full agent workflow.

---

## Theme

Six built-in themes are selectable from swatched mini-preview cards. Arrow-key navigation and Enter selection are supported for accessibility. A **Match system** toggle automatically pairs **Paper** (light) ↔ **Loam** (dark) based on `prefers-color-scheme`.

See [`docs/THEMING.md`](./THEMING.md) for the full theme model and custom-theme authoring.

---

## API & Server

> **Note:** The API & Server tab UI is planned for a near-term follow-up. Server-side infrastructure (tokens, webhooks, MCP endpoints, OpenAPI) is fully implemented. The UI to manage these from within the settings page will land soon.

What will be visible here once the UI lands:

### Server info card

Port, version, uptime, database path, and last backup time — drawn from `/api/health`, `/api/server-info`, and `/api/backups`.

### Personal access tokens

Create scoped bearer tokens for scripting against the local API.

- **Format:** `sbk_<32-char base64url>`, shown once at creation time only.
- **Scopes:** `read:ideas`, `write:ideas`, `ai:suggest`, `mcp:read`, `agents:run`.
- **Storage:** hashed with SHA-256 at rest; raw value never persisted.
- **Table columns:** name, scopes, created, last used, revoke button.

Unauthenticated requests from `localhost` continue to work for normal app use. Tokens are only required when accessing the API from an external client (e.g. a script, another machine, or a Claude/Codex session).

**API:** `GET /api/tokens`, `POST /api/tokens`, `DELETE /api/tokens/:id`.

### Webhooks

An optional outbound webhook URL fires a `POST` on these events:

| Event | Trigger |
|-------|---------|
| `idea.created` | A new idea is saved |
| `idea.graduated` | An idea is graduated via an integration |
| `idea.shipped` | An idea is marked shipped |

The payload is the full idea record. The URL and enabled events are stored in settings (`api.webhooks`). Configure via `PATCH /api/settings/api`.

### MCP (Model Context Protocol) endpoints

Read-only endpoints for external Claude or Codex sessions to pull seeds as context. All require a token with `mcp:read` scope.

| Endpoint | Description |
|----------|-------------|
| `GET /api/mcp/ideas` | Paginated idea list (`limit`, `offset`, `stage`, `category` params) |
| `GET /api/mcp/ideas/:id` | Full idea detail with rendered Markdown and attachment paths |
| `GET /api/mcp/search` | Full-text search over ideas |

> **Caution — filesystem path exposure.** `GET /api/mcp/ideas/:id` includes an `attachments` array whose `path` values are the raw server filesystem paths of uploaded files. If you share your token externally, the recipient can see absolute file paths for any idea with attachments. Use `mcp:read` tokens only with tools you trust.

---

## Backups

All backup settings that were previously in the header popover live here.

- **Backup frequency** — off, daily, or weekly.
- **Max backups to keep** — older backups are pruned automatically.
- **Backup directory** — defaults to `~/.seedbank/backups/` (or `$SEEDBANK_DATA_DIR/backups/`).
- **Manual backup** — runs a backup immediately.

The header status pill continues to show last-backup time and links to this tab.

---

## Integrations

Integration configuration that was previously inside the Graduation modal now lives here.

- **Archon** — set the Archon workspace root and project root; save once, graduate from any idea.
- **Generic project** — set a project root directory; generic scaffolds are created here.

A `configured` badge appears next to each integration that has a valid configuration. Unconfigured integrations show an amber notice inside the Graduation modal directing you here.

---

## About

- App version (hardcoded to `2.1.0`; will eventually pull from server info).
- Link to the Seedbank GitHub repository.
- Attribution.

---

## Storage: what lives where

| Setting | Storage location | Offline behavior |
|---------|-----------------|-----------------|
| Theme name + match-system | Server `settings` table (`ui.theme`) **and** `localStorage` (`seedbank.ui.theme`) | `localStorage` value applied pre-paint; server value applied on first hydration |
| AI provider, models | Server `settings` table (`ai.config`) | Shows cached values; save buttons disabled while offline |
| API keys | Server `settings` table, encrypted at rest | Never visible in browser regardless of connectivity |
| Agents config (linked, CLI paths) | Server `settings` table (`agents.config`) | Shown from cache; linking requires server |
| Token budget | Server `settings` table (`ai.config`) | Shown from cache; changes require server |
| Backups config | Server `settings` table (`backups.config`) | Shown from cache; changes require server |
| Integrations config | Server `settings` table (`integration:archon`, `integration:generic-project`) | Shown from cache; changes require server |
| Personal access tokens | Server `api_tokens` table, hashed | Not visible offline |
| Webhook URL + events | Server `settings` table (`api.webhooks`) | Not visible offline |

### Offline banner

When `GET /api/settings` fails on load, an amber offline banner appears at the top of the Settings page. All tab content is shown from the last in-memory cache (or defaults). The **Theme** tab remains fully functional offline — theme changes are written directly to `localStorage` and applied to `<html data-theme>` without a server round-trip.
