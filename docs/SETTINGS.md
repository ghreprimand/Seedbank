# Settings

Seedbank's Settings page lives at `/settings` and is the single place to configure providers, theming, tokens, backups, project graduation, and more. Access it via the gear icon (⚙) in the top-right header, or navigate directly to any tab with a deep link.

## Navigation

Settings uses a tabbed shell. On desktop (`md+`) a left-rail sidebar lists every tab; on mobile a horizontally-scrollable pill strip appears above the content area. Tabs are deep-linkable — bookmarking `/settings/ai-agents` opens that tab directly. An unknown tab segment redirects to **General**.

| Tab | Path | Purpose |
|-----|------|---------|
| General | `/settings/general` | Import / export, keyboard shortcut reference |
| AI & Agents | `/settings/ai-agents` | Provider config, agent linking, token budget |
| Theme | `/settings/theme` | Color palette, system preference toggle |
| API & Server | `/settings/api` | Server info, personal access tokens, webhooks, MCP |
| Backups | `/settings/backups` | Schedule, retention, JSON export, destinations, manual run, restore validation |
| Project Graduation | `/settings/integrations` | Project folder creation — where to create project scaffolds when you graduate an idea |
| About | `/settings/about` | Version, GitHub link, acknowledgements |

The header API-status pill (top-right, next to the gear icon) is now a link that jumps to **API & Server** when clicked.

---

## General

- **Import / Export** — the import/export modal is launched here (previously in the header). The keyboard shortcut still works from any page.
- **Shortcuts reference** — a static table of keyboard shortcuts available throughout the app.

---

## AI & Agents

Replaces the settings popover that used to live inside the inline AI chat panel.

### Service areas and methods

AI & Agents is now organized by **service family first**, then **connection method**:

- **Claude service**
  - Anthropic API key method (chat/model routing)
  - Claude account/native OAuth method (chat/model routing; account login required)
  - Claude Code CLI method (file-producing agent method; not chat routing)
- **Codex/OpenAI service**
  - OpenAI API key method (chat/model routing)
  - Codex account/app-server method (chat/model routing; account login required)
  - Codex CLI method (file-producing agent method; not chat routing)
- **Local inference**
  - Ollama
  - Local OpenAI-compatible servers: LM Studio, vLLM, llama.cpp, LocalAI, custom localhost URL
- **External / cloud routers**
  - OpenRouter, Groq, Mistral, Together, Fireworks, custom cloud endpoint

Chat/model-capable method cards show status (`connected`, `key needed`, `unreachable`, `local`, `not tested`), model/base URL state, and setup/test/list actions.

Global default routing is provider-instance based and stored server-side. A provider instance is a concrete configured method such as "Claude account", "Ollama", "LM Studio laptop", or "OpenRouter personal".

**Provider API keys vs. Seedbank tokens.** Provider API keys (OpenAI API, Anthropic API, OpenRouter, Groq, Mistral, Together, Fireworks, or another custom endpoint) are credentials for external AI services — stored server-side, encrypted at rest, never exposed to the browser. Public config responses expose only key-presence booleans such as `hasOpenAIKey`, `hasAnthropicKey`, `hasLocalOpenAICompatibleKey`, and `hasCloudOpenAICompatibleKey`. These are entirely separate from **Seedbank personal access tokens** (Settings → API & Server), which are bearer tokens for the Seedbank REST API itself.

> **Data flow:** Ollama and local endpoints send content only to the configured local host. Cloud providers (OpenAI API, Anthropic API, and remote OpenAI-compatible endpoints) send content to external servers. All AI calls are proxied server-side; the browser communicates only with the local Seedbank server.

### OpenAI-compatible endpoint methods

OpenAI-compatible configuration appears in two method areas:

- **Local inference method card** (LM Studio, vLLM, llama.cpp, LocalAI, or custom localhost URL)
- **External/cloud router method card** (OpenRouter, Groq, Mistral, Together, Fireworks, or custom cloud URL)

Local and cloud OpenAI-compatible instances are stored separately so a local endpoint does not overwrite an external router. You can add multiple saved local instances and multiple saved external/cloud instances. Each saved instance keeps its own label, base URL, preset, configured model, API-key presence, probe status, and discovered model list.

For large cloud catalogs such as OpenRouter, the expanded instance card includes an **Enabled models in Seedbank** checklist. Enabled models are the subset that appear in Feature Defaults and the Ask AI provider/model picker.

### Account providers

- **Claude account** is an account-login transport for Claude.ai subscriptions. Login and logout from the Claude account card; token refresh is automatic.
- **Codex account** is an account-login transport through the local Codex app-server. If Codex is missing or cannot start, the card reports that runtime failure directly.

When Claude account, Codex account, API-key providers, local servers, or OpenAI-compatible endpoints become usable, Seedbank discovers available models and persists them to the provider instance. Discovery runs after successful auth/key saves, account status checks, manual list-model actions, server startup, and a background refresh cycle. Provider cards show the model count and retain the last probe status after navigating away.

### Feature Defaults

**Feature Defaults** let you route individual features (Thinking Partner, field suggestions, health checks, Discover insights) to a specific provider/model instead of the global default.

- Routes can inherit the global default or pin a provider/model.
- Only **chat/model-capable methods** are routable. CLI file agents are intentionally excluded.
- Unavailable account routes may appear for visibility, but save is blocked when a route targets unavailable account transports.
- Provider/model controls use discovered model dropdowns when available, while still accepting free-text model IDs for custom endpoints.
- The global default row sets the default provider instance, model, and reasoning effort where the selected provider/model supports effort.

The **Ask AI** modal on idea fields uses the effective `field-suggestions` route by default. Its provider/model pill is clickable and lets you choose another configured provider/model for that one run. The selected route is used for preflight warnings, one-shot suggestions, and field-assist chat; it does not change permanent Settings.

### Token budget & usage

The **Usage & Guardrails** section includes a daily token limit plus advanced safety controls.

- **Daily token budget** caps total AI token use over 24 hours (`0` disables enforcement).
- **Cloud alerts** warn when selected routes send content to remote providers.
- **Local-only mode** blocks remote-provider execution.
- **Provider methods** enable or disable concrete configured instances. Disabled methods are hidden from setup and Feature Defaults and blocked server-side.
- **Per-feature, per-provider-family, per-provider-instance, and per-model caps** enforce tighter budget limits.
- **Model allowlist** restricts requests to approved model IDs only.

Usage readouts show tokens consumed in the last 24 hours and last 7 days (from `ai_usage`).

### CLI agent methods

Claude Code and Codex CLI link controls are now embedded in their respective service areas rather than a detached section.

- They are **file-producing methods** used by Develop/Continue with agent workflows.
- They are **not** used as normal chat/model routing methods in Feature Defaults.
- Authentication remains CLI-managed (`claude auth login`, `OPENAI_API_KEY`, or tool-specific config); Seedbank stores only binary path/link state.
- Runs execute in per-idea scratch workspaces and are not OS-sandboxed.

See [`docs/AGENTS.md`](./AGENTS.md) and [`docs/AI_GUIDE.md`](./AI_GUIDE.md) for full agent workflow and safety details.

---

## Theme

Ten built-in themes are selectable from swatched mini-preview cards: Paper, Chalk, Meadow, Dusk (light), Hearth, Rainwash (mid-depth), and Woad, Moss, Peat, Canopy (dark). Arrow-key navigation and Enter selection are supported for accessibility. A **Match system** toggle automatically pairs **Paper** (light) ↔ **Peat** (dark) based on `prefers-color-scheme`.

See [`docs/THEMING.md`](./THEMING.md) for the full theme model and custom-theme authoring.

---

## API & Server (API & Automation)

### Server info card

Displays live server details at the top of the tab, with a refresh button (↻) to re-fetch without reloading the page:

| Field | Source |
|-------|--------|
| Port | Settings store / `GET /api/server/info` |
| Version | Server package version |
| Uptime | Formatted d/h/m/s since server start |
| Database | Absolute path to `seedbank.sqlite` |
| Last backup | Timestamp of most recent backup run |

### Personal access tokens

Create scoped bearer tokens for scripting against the local API without a browser session.

- **Format:** `sbk_<32-char base64url>`, displayed once at creation time in a sage-toned banner. Copy with the clipboard button; the value is never retrievable after dismissal.
- **Scopes** (select one or more when creating):

  | Scope | Permits |
  |-------|---------|
  | `read:ideas` | List and view idea records |
  | `write:ideas` | Create and update ideas |
  | `ai:suggest` | Call AI suggestion endpoints |
  | `mcp:read` | Read-only MCP context endpoints |
  | `agents:run` | Start, stop, and apply agent runs |

- **Storage:** SHA-256 hashed at rest; raw value never persisted server-side.
- **Table:** name, scope pills, created date, last used date, revoke (🗑) button.

Unauthenticated requests from `localhost` continue to work for normal in-app use. Tokens are required when accessing the API from an external client (e.g. a shell script, a remote host, or an external Claude/Codex session).

**API:** `GET /api/tokens`, `POST /api/tokens`, `DELETE /api/tokens/:id`.

> Token creation is restricted to local browser sessions (the server checks that the request originates from `127.0.0.1` / `::1`). Token creation from a remote host — even a valid bearer token — is not permitted.

### Webhooks (Automation triggers)

Configure an outbound webhook URL that receives a `POST` request on idea lifecycle events. The payload is the full idea record.

- **Endpoint URL:** any reachable HTTP endpoint (Zapier, n8n, a local bus, etc.).
- **Events** (enable individually):

  | Event | Trigger |
  |-------|---------|
  | `idea.created` | A new idea is saved |
  | `idea.graduated` | An idea is graduated via an integration |
  | `idea.shipped` | An idea is marked shipped |

- Changes are saved via **Save webhook**. The button is disabled when offline.
- Stored server-side in `settings` under `api.webhooks`. Update programmatically with `PATCH /api/settings/api`.

### API reference

A **View openapi.json** button opens the machine-readable OpenAPI spec at `GET /api/openapi.json` in a new tab. Paste the URL into Postman, Insomnia, Stoplight, or any OpenAPI viewer.

The human-readable full REST reference is in [`docs/API.md`](./API.md) in the project repository.

### MCP (Model Context Protocol) endpoints

Read-only endpoints for external Claude or Codex sessions to pull seeds as context. All require a token with `mcp:read` scope.

| Endpoint | Description |
|----------|-------------|
| `GET /api/mcp/ideas` | Paginated idea list (`limit`, `offset`, `stage`, `category` params) |
| `GET /api/mcp/ideas/:id` | Full idea detail with rendered Markdown and attachment paths |
| `GET /api/mcp/search` | Full-text search over ideas |

> **Caution — filesystem path exposure.** `GET /api/mcp/ideas/:id` includes an `attachments` array whose `path` values are raw server filesystem paths of uploaded files. Only share `mcp:read` tokens with tools you trust.

---

## Backups

All backup settings live here. Backups are written to `<seedbank-data-dir>/backups/` and can optionally be copied to offsite destinations after each run.

- **Backup frequency** — off, daily, or weekly. A startup backup is always taken on server start.
- **Retention count** — how many database backup files to keep locally before pruning.
- **JSON archive export** — toggle full JSON archive snapshots on each backup run (written to `<seedbank-data-dir>/exports/`).
- **Offsite destinations** — copy backups to additional locations after each run. Two types:
  - **Local / network folder** — a folder on this machine or a mounted network share. No extra software required; the easiest option.
  - **Rclone remote** — copy to cloud storage or a remote server via [rclone](https://rclone.org). **Rclone is separate software** that must be installed and configured on the Seedbank machine before this destination type works. Install rclone, run `rclone config` to add a named remote, then enter the path here as `remote-name:folder` (e.g. `mys3:seedbank-backups` or `gdrive:backups/seedbank`). Run `rclone listremotes` to see configured remotes.
- **Test destination** — run a connectivity/writeability check before relying on a destination.
- **Manual backup** — runs a backup immediately.
- **Test restore (safe validation)** — reads and validates the latest local backup files without replacing live data. Validates what Seedbank has stored locally; rclone remote destinations are delivery targets and are not directly validated by this tool.
  - Remote restore-check recipe:
    1. Download the backup files from the remote destination (database backup and/or JSON export).
    2. Place those files into the local backup/export location on the Seedbank machine.
    3. Run **Test restore** so Seedbank validates the local copy before any real recovery action.

The rclone status indicator in the backup summary shows whether rclone is installed and how many remotes are configured on this machine.

The header status pill continues to show last-backup time and links to this tab.

---

## Project Graduation

Configure where Seedbank creates project folders when you graduate an idea. (This tab was previously labelled "Integrations".)

**What graduation does:** when you graduate a seed, Seedbank creates a project directory inside the root you set here. The directory is named after the idea title. It always contains:

- `README.md` — idea title, brief, and key context.
- `CLAUDE.md` — AI context pre-filled for use with Claude Code, Codex, or another AI coding session.
- `package.json` + starter file — for all ideas except games.
- `project.godot` stub — for game ideas.

**Settings:**

- **Local Project scaffold** — set the parent folder (project root) where Seedbank creates project directories. This works for any project type and does not require any external tool.
- **Test connection** — checks that the saved path can be found or created later. Passes if the path already exists as a directory, or if its parent folder exists (the directory is created on first graduation). Does not probe write permissions.
- **Custom adapters (Advanced, collapsed by default)** — optional adapters that integrate with a specific local workflow tool. Not required for standard project graduation. Expand the Advanced section to configure them if needed.

See [`docs/INTEGRATIONS.md`](./INTEGRATIONS.md) for adapter internals and custom adapter implementation.

A `configured` badge appears next to each adapter that has a valid project root. Unconfigured adapters show an amber notice inside the Graduation modal directing you here.

---

## About

- App version (shown from server info).
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
| Project Graduation config | Server `settings` table (`integration:<adapter-id>`; for example `integration:generic-project`) | Shown from cache; changes require server |
| Personal access tokens | Server `api_tokens` table, hashed | Not visible offline |
| Webhook URL + events | Server `settings` table (`api.webhooks`) | Not visible offline |

### Offline banner

When `GET /api/settings` fails on load, an amber offline banner appears at the top of the Settings page. All tab content is shown from the last in-memory cache (or defaults). The **Theme** tab remains fully functional offline — theme changes are written directly to `localStorage` and applied to `<html data-theme>` without a server round-trip.
