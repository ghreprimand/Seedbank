# Architecture

Seedbank is a local-first monorepo with a durable backend. The client prefers the API and falls back to local browser storage when the API is unavailable.

## System Overview

```text
Browser (React 19 + Vite + Tailwind)
  client/src/api/client.ts
        |
        v
Express API
  server/src/index.ts
        |
        v
SQLite
  <seedbank-data-dir>/seedbank.db
```

Fallback path when API is down:

```text
Browser <-> Dexie / IndexedDB cache
```

## Monorepo Packages

- `client/` — SPA UI, settings store, API client, offline fallback cache
- `server/` — Express routes, auth, SQLite repository, AI, integrations, backups
- `shared/` — shared TypeScript domain types

Top-level scripts:

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
```

## Persistence Model

Primary DB tables:
- `ideas`
- `versions`
- `stage_transitions`
- `landscape_reports`
- `settings`
- `ai_*` usage/conversation tables
- `api_tokens` (`server/migrations/003_api_tokens.sql`)

`settings` is namespaced and now includes keys such as:
- `ui.theme`
- `ai.config` (legacy `ai:config` migrated on startup)
- `api.webhooks`
- `integration:<adapter-id>` (one namespaced key per registered adapter; for example `integration:generic-project`)
- backup keys (`backup.config`, `backup.lastRun`)

## Stage Lifecycle Architecture

Stage lifecycle behavior is now a first-class architecture layer, not only a UI label:

- Stage DB keys stay stable (`seed`, `sprout`, `pitch`, `prototype`, `plot`, `shelved`, `cold-storage`, `shipped`) while display labels are garden-themed:
  - `pitch` displays as **Bloom**
  - `prototype` displays as **Greenhouse**
  - `shelved` displays as **Dormant**
  - `shipped` displays as **Market**

- `stage_transitions` table (`server/migrations/008_stage_transitions.sql`) stores append-only stage-change history:
  - `id` (PK)
  - `idea_id` (FK)
  - `from_stage`
  - `to_stage`
  - `transitioned_at`
  - `auto` (boolean)
- Repository layer writes transition records on stage changes and exposes timeline queries (`recordStageTransition`, `getStageTransitions`, `getStageTimeline`).
- API route `GET /api/ideas/:id/stage-transitions` returns chronological transition history for Idea Detail timeline UI.
- Shared readiness module `shared/stageReadiness.ts` centralizes promotion criteria and powers:
  - Idea health-check readiness checklist
  - promotion nudges
  - stage-aware health-check prompt context
- Progressive disclosure field map (`shared/types.ts`) now includes lifecycle-only fields:
  - `aesthetic` (introduced at Plot)
  - `retrospective` (introduced for Market retrospectives and available in all-fields lifecycle stages)
- Progressive disclosure now follows an additive maturity map:
  - Seed: title, The Spark, tags, mood, excitement, landscape analysis
  - Sprout: + Concept
  - Bloom: + The Case, Elevator Pitch
  - Greenhouse: + Risks, Build Notes
  - Plot: + Aesthetic & Style, Feasibility, links, images, related ideas
  - Dormant/Cold Storage/Market: all fields
- Readiness criteria currently enforce:
  - Seed → Sprout: The Spark >= 40 chars + at least one tag
  - Sprout → Bloom: Concept filled
  - Bloom → Greenhouse: The Case + Elevator Pitch filled
  - Greenhouse → Plot: Risks + Build Notes filled
- Board architecture now supports two views over the same filtered dataset:
  - Grid cards (`client/src/pages/Board.tsx`)
  - Stages swim lanes (`client/src/pages/StagesView.tsx`) with native HTML5 drag/drop stage updates

## Image Gallery Storage

- Migration `009_aesthetic_retrospective.sql` adds `ideas.aesthetic` and `ideas.retrospective`.
- Idea images are uploaded through:
  - `POST /api/ideas/:id/images`
  - `GET /api/images/:ideaId/:filename`
  - `DELETE /api/ideas/:id/images/:filename`
- Files are stored under `<seedbank-data-dir>/images/<idea-id>/`.
- The canonical reference stored in `idea.images` is the API path (`/api/images/:ideaId/:filename`).

## Stage-Aware AI + Landscape Analysis

Two AI architecture additions are stage/lifecycle-aware:

- Stage-aware prompt assembly in `server/src/ai/prompts.ts`:
  - `stagePersonality(stage)` injects stage-specific guidance into Thinking Partner and field-assist prompts.
  - field-suggestion expectations adapt tone/rigor by stage (exploratory early, sharper at Bloom, practical later).
- Landscape analysis feature route:
  - endpoint: `POST /api/ai/landscape-analysis`
  - feature id: `landscape-analysis`
  - uses normal Feature Defaults routing + guardrails + confirmation + budget enforcement
  - returns structured viability sections (`existingAlternatives`, `gapsAndPainPoints`, `demandSignals`, `positioningAngle`, `overallViability`)
  - persists reports into `landscape_reports` for recall/review on subsequent idea-detail loads

## Settings Architecture

Server aggregate endpoint:
- `GET /api/settings`

Section patch endpoint:
- `PATCH /api/settings/:section`

The server composes a single aggregate payload containing:
- UI theme
- AI public config
- API webhooks and token metadata
- backup status
- integration summaries
- server info

Client state:
- `client/src/stores/settings.ts` (Zustand)
- hydrates from `GET /api/settings`
- writes through `PATCH /api/settings/:section`
- preserves theme behavior offline via `localStorage`

## Theme Token Layer

Theme architecture is palette-only and does not require component rewrites:
- `client/src/theme/themes.css` defines per-theme `--c-*` tokens.
- `client/src/index.css` maps Tailwind semantic tokens (`--color-*`) to `--c-*` via `@theme`.
- `client/src/main.tsx` sets `data-theme` before first paint to avoid FOUC.

Result: components continue using semantic utility classes (`bg-paper`, `text-ink-800`) across all themes.

## API Security Model

Auth middleware (`server/src/middleware/auth.ts`) runs on `/api`:
- Loopback requests can use implicit local auth with no bearer token.
- Non-loopback requests must present `Authorization: Bearer <token>`.
- Bearer tokens are scoped and deny-by-default per route.

Token storage:
- plaintext token is returned once at creation
- only `sha256` hash is stored in `api_tokens`

Important hardening:
- `POST /api/tokens` requires implicit local session, preventing bearer token chaining.
- `trust proxy` is disabled in Express to reduce IP spoofing ambiguity in local-first deployments.

## OpenAPI and API Surface

`server/src/openapi.ts` builds the OpenAPI document served at:
- `GET /api/openapi.json`

This spec is the machine-readable API contract used by the in-app API reference.

## Webhook Subsystem

`server/src/webhooks.ts` delivers optional outbound events:
- `idea.created`
- `idea.graduated`
- `idea.shipped`

Delivery characteristics:
- queued async dispatch
- max queue depth 500 (drops oldest when full)
- 5 second request timeout
- redirects refused
- no HMAC signing in v1

## MCP Facade

Read-only MCP-style endpoints:
- `GET /api/mcp/ideas`
- `GET /api/mcp/ideas/:id`
- `GET /api/mcp/search`

These routes require `mcp:read` for bearer auth and are designed for external AI/tool context pulls, not mutation.

## Project Drafting Architecture

Project generation is implemented as a local-first wrapper around the normal AI project-drafting feature route:

- shared feature id: `project-drafting`
- API routes: `POST /api/ai/project-draft` for review-only drafts and `POST /api/ai/project-generate` for create-folder-and-write flow
- service method: `AiService.draftProject`
- prompt/parser helpers: `server/src/ai/prompts.ts`
- client section: `client/src/components/ProjectGenerationSection.tsx`

The route resolves Feature Defaults in the same way as Thinking Partner, field suggestions, health check, and Discover insights. Guardrails, remote-provider confirmation, disabled providers, model allowlists, rate limits, and token budgets are enforced before the request reaches the provider.

The provider returns JSON containing a summary and proposed files. The parser tolerates common model drift such as unquoted object keys and trailing commas. The server accepts only safe relative paths, rejects traversal/hidden paths, caps the number and size of files, and protects existing project files from overwrite. The generate endpoint creates a project folder when the idea does not already have one, ensures the standard repo docs are present (`README.md`, `SPEC.md`, `IMPLEMENTATION_NOTES.md`, `TODO.md`), writes them locally, and updates `graduatedTo`. The feature does not write canonical idea fields.

## Integration Architecture

Integrations live under `server/src/integrations/` and implement a shared adapter interface. The registry currently provides:
- `generic-project` (general-purpose built-in adapter; works with any local directory)
- Optional custom adapters can be registered by implementing `Integration` from `types.ts` and adding them to `registry.ts`.

Graduation is server-side because it performs local filesystem writes and then updates idea lifecycle fields (`graduatedTo`, `stage`).

## Backup Architecture

Data directory:

```text
<seedbank-data-dir>/
├── seedbank.db
├── backups/
├── exports/
└── images/
```

Backup flow supports:
- startup safety snapshots after migrations
- scheduled daily/weekly DB copies
- manual backup runs
- optional JSON archive export
- optional copy to local-path or rclone destinations after each backup run

## Operational Notes

- API default port: `4800`
- Vite default port: `5173`
- SQLite uses WAL mode
- CORS is restricted to local origins (`localhost` / `127.0.0.1`)
