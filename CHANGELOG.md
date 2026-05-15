# Changelog

## Unreleased

### Claude account reauth

- Improved Claude account reauth UX so Seedbank watches for the local OAuth callback after opening the Claude sign-in tab and refreshes account status automatically.
- Clarified that the callback URL field is only for manual fallback cases where the local callback tab cannot reach Seedbank.

### GitHub Publishing

- Added optional post-graduation GitHub publishing for ideas that already have a local project folder.
- Added GitHub status/details in Settings using the local `gh` CLI session: avatar, login/name, profile link, repo counts, followers/following, and plan/private-repo metadata when GitHub returns it.
- Added an explicit Publish to GitHub modal with repo name, optional owner, public/private visibility, and initial-push controls.
- Added server-side GitHub repo creation and bounded `git` initialization/commit/push orchestration without storing GitHub tokens in Seedbank.
- Added `GET /api/integrations/github/status` and `POST /api/integrations/github/publish/:ideaId` endpoints.
- Added in-app manual, contextual help, and docs explaining GitHub CLI setup, local-first publishing, token handling, and retry/partial-failure behavior.

### Account reauth notice and documentation accuracy

- Added a persistent Claude/Codex account reauth notice that appears only after this browser has previously seen a successful account auth and current status later requires sign-in again.
- The notice links directly to Settings → AI & Agents (`/settings/ai-agents`) and includes a refresh action; intentional logout clears the browser-side reminder.
- Removed the old CLI runner documentation and added Project drafting docs that describe provider-routed file drafts through normal AI configuration.
- Refreshed backup documentation to mention both startup safety snapshots and scheduled backup checks.

### Manual readability, linking, and privacy-copy accuracy

- Improved in-app manual readability across themes by switching manual `code` and `tip` blocks to stronger neutral contrast tokens in `ManualModal`.
- Added inline markdown-link rendering in manual text blocks (`p`, `ul`, `tip`) so repo-doc references can be clickable.
- Updated API reference mentions to link directly to `docs/API.md` in the GitHub repository (manual tip + Settings → API & Server).
- Reframed absolute “always local” one-liners to conditional wording when cloud AI providers or offsite backup destinations are enabled.
- Updated About tagline to: “Local by default, cloud only if you opt in.”

### Stage lifecycle enhancement (Phases 1-6)

- Added timestamped stage-transition tracking (`stage_transitions` table), repository write hooks on stage changes, timeline API endpoint (`GET /api/ideas/:id/stage-transitions`), client fetch wrapper, Idea Detail stage timeline UI, and export/import support for transition history.
- Implemented progressive disclosure by stage with a shared field-visibility map, stage-based section rendering in Idea Detail, and a session-scoped "Show all fields anyway" override to keep users unblocked.
- Added stage readiness criteria (`shared/stageReadiness.ts`), health-check checklist integration, one-click promotion actions when criteria are met, and informational promotion nudges near the stage badge.
- Added AI Landscape Analysis (`POST /api/ai/landscape-analysis`) with structured sections (alternatives, gaps, demand, positioning, viability), full Feature Defaults routing/guardrail support, and in-app results + disclaimer messaging.
- Added stage-aware AI prompt personality tuning for Thinking Partner and field-assist suggestions so tone and rigor adapt automatically to idea stage.
- Added Garden Stages view with horizontal stage lanes, native HTML5 drag/drop stage moves, collapsed late-stage lanes, touch fallback (tap-to-move), and a persisted `Grid | Stages` toggle.
- Completed full documentation and help sweep across in-app manual, contextual help entries, Architecture/Settings/API docs, README feature list, and devlog rationale notes.

### Lifecycle terminology and workflow refinement

- Finalized garden-themed display stage names while preserving DB keys: Pitch→Bloom (`pitch`), Prototype→Greenhouse (`prototype`), Shelved→Dormant (`shelved`), Shipped→Market (`shipped`).
- Renamed key field labels across UI/manual/help to reflect idea maturity flow: The Spark/Raw Notes (`fullNotes`), Concept (`hook`), The Case (`whyItMightWork`), Elevator Pitch (`pitch`), Build Notes (`techStack`), and Feasibility (`jamScore` display).
- Changed graduated project scaffolds from Claude-specific `CLAUDE.md` output to provider-neutral `AGENTS.md` context files.
- Replaced Kanban wording/layout with **Stages View** swim lanes and a persisted `Grid | Stages` header toggle.
- Redistributed progressive disclosure so each stage introduces focused new work:
  - Seed core capture
  - Sprout adds Concept
  - Bloom adds The Case + Elevator Pitch
  - Greenhouse adds Risks + Build Notes
  - Plot adds Aesthetic & Style, Feasibility, links, images, related ideas
  - Market includes Retrospective
- Added `aesthetic` and `retrospective` fields to the idea model and editing flow.
- Added Plot-stage **Image Gallery** workflows: upload, browse, lightbox navigation, and delete.
- Persisted landscape analyses in `landscape_reports`; idea detail now loads latest saved report and supports re-analysis.
- Updated progressive teaser UX with direct stage-advance actions and a stage-only reset path after full-field override.
- Renamed AI assist lens copy from "Jam / hackathon" to **Scope down**.

## 2.3.0 — Customizable Keyboard Shortcuts & Cloud Backup Guide

### Customizable keyboard shortcuts

- **All three main shortcuts are now remappable.** Settings → General replaces the static shortcut reference table with a live `ShortcutRecorder` widget for each action (Focus search, Open quick capture, Open manual). Click any binding to enter recording mode, press the desired key combination, and it saves immediately.
- **Modifier key support.** Ctrl, Alt, Shift, and ⌘ can be combined with any letter or number. Modifier-backed bindings fire even while a text field is focused; plain-key bindings are suppressed while typing.
- **Conflict detection.** A warning appears if two actions share the same binding. Blocked: bare modifiers, Esc, Tab, F-keys, and browser-reserved combos (Ctrl+W/T/N/R/S/A/C/V/X/Z/Y etc.).
- **Reset to default.** A ↺ icon appears next to any customised binding; clicking it removes the stored override and restores the original key.
- **Esc permanently reserved.** Close modal / blur search always uses Esc; it is shown as a locked row.
- Bindings are stored server-side under `ui.shortcuts` and survive restarts. The client resolves effective bindings at mount time (stored overrides merged over `DEFAULT_SHORTCUTS`).
- New shared types: `ShortcutBinding`, `ShortcutConfig` in `shared/types.ts`.
- New component: `client/src/components/ShortcutRecorder.tsx`.

### Cloud backup documentation & in-app guide

- **Cloud Backup Setup manual section** added — full step-by-step rclone install and config instructions for Google Drive, Dropbox, OneDrive, Backblaze B2, Amazon S3 (and S3-compatible: Cloudflare R2, Wasabi, MinIO), and SFTP/SSH. Covers headless server OAuth, config file location, and a verification recipe.
- **"Cloud setup guide" button** in Settings → Backups → Offsite destinations opens the manual directly to the cloud setup section.
- The rclone "not installed" and "no remotes" warning banners now include inline links to the relevant manual section.
- New `code` block type in the manual renderer displays terminal commands in a dark monospace block.
- `docs/SETTINGS.md` updated for both features.

---

## 2.2.0 — Expanded Themes, In-App Manual & Contextual Help

Seedbank v2.2.0 completes the theme catalog, adds a comprehensive searchable in-app user manual, and layers in a quiet contextual help system — all while tightening platform-neutral documentation and public-repo hygiene.

### Theme catalog — now 10 themes

- **Four new themes added:** Hearth (mid-depth warm clay/taupe), Rainwash (mid-depth cool sage/stone), Peat (dark umber/black-soil), Canopy (dark forest green with bark/copper accents).
- **Two themes replaced for distinctness:** Parchment → **Chalk** (cool mineral/blue-gray, opposite temperature from all other light themes); Loam → **Woad** (deep botanical blue-indigo, the only blue-dominant dark theme). The collision pairs Parchment/Dusk (warm cream) and Loam/Peat (warm dark earth) no longer exist.
- **Migration:** Users with `parchment` or `loam` saved in the database are automatically migrated — at server startup (`migrateLegacySettings`), at API read time (`uiThemeConfig`), and at client hydration (`stores/settings.ts`) — to ensure ThemeTab always shows the correct active card and localStorage stays in sync.
- **Match system dark default** updated from Loam → Peat (warmer, more neutral dark fallback).
- Pre-paint IIFE in `main.tsx` carries a `MIGRATE` map for both legacy names; the IIFE writes back on migration so subsequent cold boots are already clean.
- Theme picker expanded to 10 cards; keyboard arrow navigation preserved; mobile layout scales gracefully.
- `docs/THEMING.md` updated for the full 10-theme catalog.

### In-app searchable manual (28 sections)

- **Help/Manual trigger** — BookOpen icon in the app header; `?` global keyboard shortcut.
- **Manual modal** — grouped index (left rail on desktop, optgroup selector on mobile), section anchors, scroll-to-section navigation, field-note aesthetic.
- **Local search** — all-words matching across title/body/keywords; matching words highlighted in result titles (`bg-sage-100 text-sage-700`); empty state with guidance.
- **28 sections across 8 groups:** Getting Started, Garden, Idea Editor, Health & AI, Settings, Integrations, API & Automation, Troubleshooting. Covers every major feature including: stage/category badges, score pickers, health check, Thinking Partner, prompt modes, Project drafting, theme match system, token budgets, API tokens, webhooks, MCP, backups, import/export, version history, compost, and integrations.
- **Deep-link support** — contextual help popovers can open the manual to a specific section without breaking the current route.
- **Accessibility** — focus trap, Escape close, labelled `role="dialog"`, keyboard-navigable index/search/results.
- **Platform-neutral language** — integration sections explain generic adapters, external project roots, REST/OpenAPI, webhooks, MCP, and AI-assisted workflows without referencing private tools.

### Contextual help system

- **`HelpProvider` / `useHelp()` hook** — fast-refresh-safe context split across `helpContext.ts`, `HelpContext.tsx`, `useHelp.ts`.
- **`HelpModeToggle`** — always-visible button in the manual modal header to enable/disable help mode. When enabled, `HelpButton` markers appear near documented UI elements.
- **`HelpButton` + `HelpPopover`** — each popover carries a summary, optional details, and an "Open manual section" deep-link. Touch and keyboard activation work; hover-only dead ends avoided.
- **Coverage:** stage picker, category badges, health check, Project drafting, score pickers, token budget, API token scopes, webhooks, backup schedule.
- **Non-intrusive by default** — help triggers do not block primary actions or resize controls; `HelpButton` is only rendered when help mode is on.

### Full ApiServerTab implementation

- Server info card (port, version, uptime, DB path).
- Personal access tokens table — create/revoke, scope list (`read:ideas`, `write:ideas`, `ai:suggest`, `mcp:read`), token shown once with copy button.
- Webhooks configuration — URL + event picker.
- OpenAPI spec link.

### Agent isolation wording fix

- Removed inaccurate "sandboxed" and "no access to arbitrary filesystem paths" claims from the manual.
- Now says explicitly: the agent process is **not** OS-sandboxed; Seedbank sets `cwd` and validates applied file paths for directory traversal, and users should only link binaries they trust.

### Legibility audit

- Eleven `ink-400` → `ink-500` bumps on small-text surfaces: `CategoryBadge`, `ScorePicker` labels, `ManualModal` group/search-meta text, settings section headers, `ApiServerTab` table headers and date columns.
- `ManualModal` group labels: `ink-300` → `ink-400`.

### Platform-neutral documentation

- `docs/INTEGRATIONS.md` rewritten integration-neutral — removed private-tool-specific framing.
- All `~/.seedbank/` paths in docs generalised to `<seedbank-data-dir>`.
- `docs/SETTINGS.md` updated: six themes → ten themes; theme names listed; Paper ↔ Peat noted for match-system default.
- `docs/AI_GUIDE.md`, `docs/API.md`, `docs/AGENTS.md` refreshed with v2.2 accuracy fixes.
- Four new doc files added this cycle.
- MCP scope corrected to `mcp:read` (not `read:ideas`) throughout manual, docs, and API reference.

### Screenshot tooling

- `scripts/capture-readme-screenshots.mjs` — Playwright-based deterministic screenshot script. Seeds demo data via `/api/import`, navigates routes, captures 8 named JPGs to `docs/assets/screenshots/`. Additive-safe by default; `--replace-data` required for destructive seed. Flags: `--base-url`, `--api-url`, `--out-dir`, `--skip-seed`, `--strict-help`.
- `docs/assets/screenshots/README.md` — privacy/safety rules and expected output list.
- Generated image files are `.gitignore`d by default; only explicitly `git add`-ed images are committed.

---

## 2.1.0 — Settings, API, Theming & AI Features

Seedbank v2.1.0 ships closely-related feature groups that turn scattered configuration popovers into a permanent Settings page, give the local API a real security surface, make the UI themeable at runtime, and expand AI-assisted workflows.

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
- **Outbound webhooks** — configure a URL and pick events (`idea.created`, `idea.graduated`, `idea.shipped`). Payload is the full idea record.
- **Read-only MCP endpoints** — `/api/mcp/ideas` and `/api/mcp/search` expose seeds as context for external Claude or Codex sessions. Token-gated.
- **OpenAPI spec** — generated at `/api/openapi.json`; browsable from the API & Server tab.
- **Server info card** — port, version, uptime, DB path, last backup time.
- `ConnectionStatus` pill links to `/settings/api`.

### AI & Agents tab

- Provider cards for OpenAI, Anthropic, and Ollama — status pill, inline test-connection, expandable key/model/URL fields. Replaces the dense grid in the AI panel popover.
- Default-provider radio — single source of truth; the Thinking Partner panel reads this setting.
- Token budget slider with last-24 h / last-7 d usage readout (from `ai_usage` table).
- **Project drafting route** — configure provider/model/effort through Feature Defaults and generate reviewable starter files from an idea.

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
- MCP endpoints are read-only and token-gated; they return idea records and search results as context for external AI sessions.
- Project drafting returns reviewable files and does not auto-write canonical idea fields.

### Documentation

Seven docs added or refreshed: `SETTINGS.md`, `THEMING.md`, `API.md`, `AGENTS.md`, `AI_GUIDE.md`, `ARCHITECTURE.md`, `INTEGRATIONS.md`. README Features list and API Reference section updated; full Documentation table added.

---

## 2.0.0 — Permanent Idea Vault

Seedbank v2.0.0 turns the original browser-only idea sketchpad into a durable local application with a persistent backend, AI-assisted development, project graduation, recoverable delete, and automatic backups.

### Added

- **Monorepo workspace** with `client`, `server`, and `shared` packages.
- **Express API server** on port `4800`.
- **SQLite persistence** via `better-sqlite3` at `<seedbank-data-dir>/seedbank.db` (default: `~/.seedbank/` — configurable via `SEEDBANK_DATA_DIR`).
- **Shared TypeScript domain types** used by both client and server.
- **REST API** for ideas, versions, stats, import/export, compost, backups, integrations, and AI.
- **Frontend API client** that uses the backend first and Dexie/IndexedDB as offline cache and fallback.
- **One-time browser data migration** from IndexedDB into SQLite.
- **Soft delete / Compost** with restore, purge, and 30-day retention.
- **Automatic backups** with startup database backups, scheduled daily/weekly backups, manual backup, and JSON archive exports.
- **Project graduation framework** with plugin-style integrations.
- **Graduation adapter plugins** — built-in generic local project scaffold; optional custom adapters can target specific local tools.
- **Generic project scaffold** for local project creation using any directory.
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
- Scheduled JSON exports are written to `<seedbank-data-dir>/exports/`.

## 1.0.0 — Initial Release

Seedbank v1.0.0 was a local-first project idea manager built with React, TypeScript, and IndexedDB.

### Features

- Quick "Plant a Seed" flow with title and notes.
- 14-field editor for pitch, notes, hook, risks, tech stack, tags, scores, related ideas, links, and images.
- Board view with search, filters, and sorting.
- Gardening lifecycle stages from Seed to Market.
- Debounced auto-save to IndexedDB.
- Automatic version snapshots and restore.
- Discovery tools: Daily Seed, Cross-Pollinate, Draw from Storage, and Idea Weather.
- JSON and Markdown import/export.
- Keyboard shortcuts for capture and search.
- Responsive UI with custom paper/sage/ink/clay theme.
