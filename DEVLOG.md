# Seedbank — Development Log

Newest entries at the top.

---

## 2026-05-14 — Manual Contrast Fixes, Repo Doc Linking, and Conditional Privacy Copy

This pass addressed readability and wording issues reported in live theme testing of the in-app manual.

Manual rendering updates:
- `client/src/help/ManualModal.tsx` now renders manual `code` blocks with neutral, high-contrast theme tokens (`bg-ink-100`, `border-ink-300`, `text-ink-900`) instead of low-contrast green-on-green styling in darker palettes.
- Manual `tip` callouts were moved to neutral readable surfaces (`bg-paper-warm`, `border-ink-300`, `text-ink-800`) to avoid contrast collapse in dark themes.
- Added lightweight inline markdown-link support for manual `p`, `ul`, and `tip` blocks so referenced repo docs can be clicked directly.

Documentation/copy updates:
- Updated the manual REST reference tip to include a direct link to `docs/API.md` in the repository.
- Updated Settings → API & Server (`ApiServerTab`) to link `docs/API.md` directly instead of showing plain text only.
- Reframed absolute-local privacy statements to be conditional when cloud AI or offsite backup destinations are enabled.
- Updated the About one-liner to: “Local by default, cloud only if you opt in.”

Validation:
- `npm run typecheck`
- `npm run lint`

Privacy/safety:
- No secrets, keys, tokens, private paths, or machine-specific credentials were introduced in this change set.

---

## 2026-05-14 — Server Route Modularization and AI Service Helper Split

This pass continued the codebase audit cleanup after the default quality gates were stabilized.

Server startup is now slimmer: backup behavior moved into a dedicated `BackupService` plus backup route registration, and AI HTTP endpoints moved into `server/src/ai/routes.ts`. `server/src/index.ts` now stays closer to app wiring, shared settings, domain routes, and startup timers.

AI service internals were split conservatively. Prompt construction and field-suggestion parsing moved to `server/src/ai/prompts.ts`; guardrail primitives such as confirmation tokens, guardrail errors, and rate limiting moved to `server/src/ai/guardrails.ts`; usage-summary/audit helpers moved to `server/src/ai/usage.ts`. Provider execution and config behavior were preserved.

The Claude account tests also gained a shared cross-process auth snapshot lock so the default server test command remains stable even when Node runs test files in parallel.

Validation:
- `npm run typecheck`
- `npm run test -w server`
- `npm run lint`

Follow-up candidates remain: a deeper `ai/service.ts` config-normalization split, provider-by-provider extraction from `providers.ts`, and the larger client component splits.

---

## 2026-05-14 — Default Quality Gates Stabilized

This pass closed the audit's first priority before larger server modularization work: make the default quality gates trustworthy and green.

The server test flake was narrowed to Claude account tests that share process-level state (`globalThis.fetch`, account auth files, and catalog cache). Those tests now explicitly opt out of Node's per-file test concurrency, so `npm run test -w server` no longer depends on manually passing `--test-concurrency=1`.

The client lint failures were resolved without disabling React hook rules. The affected AI/settings components now avoid synchronous state syncing in effects by using derived values or render-time draft resets where local editable state is still needed. The cleanup touched the AI Assist route picker, AI & Agents method/server selectors, Claude account compact toggle, Feature Defaults drafts, model picker custom mode, provider-card auto-expand behavior, and Discover category-label dependency handling.

Validation:
- `npm run lint`
- `npm run typecheck`
- `npm run test -w server`
- Playwright smoke check confirmed the app rendered without browser console or page errors.

No behavior bugs were uncovered during this phase, so the larger modularization work remains a follow-up.

---

## 2026-05-14 — Granular Help Accuracy Pass + Docs/Manual Truth Sweep

This pass tightened contextual help and documentation to match the live code paths exactly.

Contextual help improvements:
- Reworked AI settings help from broad section buckets to control-level targeting (service cards, provider cards, feature-routing rows, provider/model/effort/verbosity selectors).
- Added provider-specific help copy so Codex account, OpenAI API, Anthropic API, local inference, and external/cloud routes no longer inherit misleading generic text.
- Added missing `data-help` wiring for high-complexity surfaces: Manual modal, Graduation modal, Agent run panel (prompt/transcript/proposed files/apply), and API Reference subsection.
- Updated stale help labels (`Settings` tab names, idea action wording, API/server descriptor).

Documentation/manual corrections from code audit:
- Updated README/docs/manual to reflect that CLI agent linking is currently API-driven (`POST /api/agents/link`) instead of a dedicated settings card.
- Corrected API docs for current AI provider-instance routing shape and backup patch fields (`retentionCount`, `destinations`).
- Corrected settings/docs/manual backup behavior (startup is schedule-check-driven, not unconditional backup every boot).
- Corrected MCP auth wording to distinguish bearer external clients from implicit local loopback auth.
- Corrected manual behavior text for board defaults, stage icons/tips, version history flow, health-check trigger, and contextual-help control wording.

Validation and safety:
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- Secret-pattern scan (keys/tokens/private-key signatures) on working tree
- Runtime restart confirmed at `http://localhost:5174`

## 2026-05-14 — Documentation Accuracy Sweep + Contextual Help Redesign

This session did two coordinated upgrades: (1) a code-based documentation/manual correction pass, and (2) a full contextual-help interaction redesign modeled on the Archon click-target flow.

The help system was rebuilt around a global mode instead of scattered inline popovers. A new floating bottom-right help control now toggles help mode, supports collapse-to-chevron state, and keeps clear exit affordances (banner + Esc). While help mode is active, capture-phase click interception resolves the nearest `data-help` target and opens a contextual popover anchored to that UI region. Help entries now come from a central map (`client/src/help/helpContentMap.ts`) with resolver support for dataset overrides and generic fallback entries for unlabeled controls. The app now applies hover/highlight affordances in help mode, and opening the manual exits help mode to avoid interaction conflicts.

Coverage expanded from sparse marker buttons to broad surface tagging across layout navigation, Garden, Discover, Compost, Idea Detail major sections, Settings shell/tabs, and key modals (quick capture, import/export, ask-AI, version history). Legacy `HelpButton` calls were kept as a compatibility bridge into the new global popover path.

Documentation/manual accuracy fixes were applied directly from implementation checks (server routes + client behavior), including:
- manual score model corrected to the two live fields (Personal Excitement + Jam Suitability),
- version-history snapshot behavior corrected (score edits are included),
- compost purge behavior corrected (purge on Compost load path),
- MCP docs/manual corrected to paginated `GET /api/mcp/ideas` response shape,
- graduation manual text corrected to adapter-defined stage updates (not hard-coded Shipped),
- API docs expanded for current AI/account/testing/settings integration routes and settings sections,
- settings docs corrected to runtime database filename/path conventions,
- agents docs corrected for current AI settings navigation and removed stale Detect-only wording.

Validation:
- `npm run typecheck`
- `npm run build`

---

## 2026-05-14 — AI Settings Persistence, Model Discovery, and Ask AI Route Selection

This session completed the AI & Agents settings refactor that moved the former monolithic settings tab into focused components under `client/src/pages/settings/ai/`. The tab now treats provider methods as persistent provider instances: account-login methods, API-key methods, local servers, and OpenAI-compatible cloud routers can each carry their own label, configured model, discovered models, enabled-model subset, probe status, guardrail state, and routing identity.

The server now persists discovered model catalogs on provider instances and refreshes them after auth/key events, account status checks, startup, and a background cycle. Claude account and Codex account model catalogs are populated automatically after login/status checks; local and external OpenAI-compatible instances can be added, listed, enabled, disabled, and routed independently. Probe/test results are persisted as `lastProbeStatus` and `lastProbedAt`, so cards no longer revert to "not tested" after navigation.

Feature Defaults were upgraded to choose provider instance, model, and reasoning effort. Discovered-model dropdowns are used where available while preserving custom model entry for custom endpoints. The Ask AI modal now starts from the effective Field suggestions route and exposes a clickable provider/model pill for per-run route overrides; preflight, one-shot suggestions, and field-assist chat all execute against that temporary selection without changing permanent settings.

Guardrails were tightened so disabled provider methods are hidden from setup and Feature Defaults and blocked server-side. The advanced controls now present a single concrete "Provider methods" enable list instead of separate duplicated provider-family and provider-instance lists.

The About page and generated OpenAPI response now read the running server/package version instead of displaying the previous hard-coded `2.1.0` value. No release tag was created as part of this work.

## 2026-05-14 — AI Settings Frontend: Provider-Instance Routing, Claude Account Polish, Cloud Endpoint Guardrails

This session delivered three focused frontend-only commits on the AI settings surface. `f72351a` migrated Feature Defaults routing to configured provider instances (instead of coarse provider IDs), added instance-aware availability gating and model hints, surfaced compact provider-instance diagnostics in AI Services, updated the AI Assist modal badge to show effective provider instance/model/effort context, and aligned default client settings shape with provider-instance contracts in `client/src/stores/settings.ts`. Primary files were `client/src/pages/settings/AiAgentsTab.tsx`, `client/src/components/AiAssistModal.tsx`, and `client/src/stores/settings.ts`.

`39e12e8` polished Claude account login UX in `AiAgentsTab.tsx` by removing release-candidate placeholder tone, clarifying signed-out/auth-required state messaging, and improving manual callback wording while keeping the existing account-login callback flow intact. Terminology remains user-facing (`API key` vs `Account login`) without introducing CLI/native/app-server phrasing in normal UI copy.

`1815c2c` hardened External/Cloud endpoint UX in `AiAgentsTab.tsx`: added explicit cloud residency/data-leaves-device warnings, added custom-cloud HTTPS/non-local URL guardrails in-form, disabled Save for unsafe custom cloud URLs, and cleared stale cloud API key state when cloud preset/base URL changes without a replacement key. Targeted verification for each slice was `npm --prefix client run -s typecheck`, passing cleanly.

## 2026-05-13 — Backend Capability Contract And Account Runtime Truthfulness

This session delivered three backend slices to support the RC AI & Agents truthfulness gate and the new service-family-first IA model. First, preflight metadata was corrected in `97eee68` so account aliases (`codex-recommended`, `codex-fast`, `claude-*-latest`) no longer appear as authoritative `resolvedModelId` values. Second, Codex account runtime was made explicit and truthful in `db37483`: the app-server path is now opt-in (`SEEDBANK_ENABLE_CODEX_ACCOUNT`) with deterministic unavailable/auth-required messaging when disabled or not signed in, plus focused gate tests.

The main architecture slice landed in `b6801ae`: a new backend capability contract (`AiMethodCapability`) now exposes method-level metadata for Settings/UI via `GET /api/ai/method-capabilities`. It distinguishes service family (`claude`, `codex-openai`, `local-inference`, `external-router`), connection method (`api-key`, `account`, `local-server`, `openai-compatible`, `cli-agent`), channel (`chat-model` vs `file-agent`), feature-routability, and availability state with reasons. Chat/model providers (API keys, account transports, local inference, and openai-compatible presets) are now surfaced separately from file-producing CLI agent methods (`claude-code-cli-agent`, `codex-cli-agent`) which are explicitly non-routable.

In parallel, two no-edit feasibility artifacts were produced for deferred backup follow-ups: `rclone-probe-cache-feasibility.md` and `backup-readiness-followup-plan.md`, covering a server-side TTL refresh option for rclone readiness cache and a remote restore-validation “download then validate locally” docs recipe. These remain deferred pending operator/coordinator pull-in.

## 2026-05-13 — AI Provider Grouping, Account Truthfulness & Privacy Notice Hardening

This session resolved the last blocking RC gate: AI provider card truthfulness and grouping. Nine commits across five files closed all Reviewer and Tester findings through five gate cycles.

The core work (`db37483` through `3a7be31`) established truthful framing for the account-transport providers: the Claude account card now shows a "coming soon" violet pill and has no login flow (login is not yet available), and the Codex account runtime is gated behind a `SEEDBANK_ENABLE_CODEX_ACCOUNT` env-var opt-in defaulting to off. Both cards have their "Set default" button unconditionally hidden — the Claude card via `claudeAccountStatus === 'connected'` (never true), and the Codex card via `ai.codexAccountAvailable === true && ai.codexAccountAuthenticated === true && codexAccountStatus === 'connected'` (all false by default). A key hardening detail (`d0aaa9c`): the `ProviderCard` render guard was changed from `canSetDefault &&` to `canSetDefault === true` because JS evaluates `undefined && x` as `undefined`, which was triggering the prop's `= true` default and showing the button when `codexAccountAvailable` was absent from a stale server payload.

The provider reorganisation (`80fab24`) replaced the flat provider list with four labelled groups — Direct API providers, Local inference, External & custom endpoints, and Account & subscription transports — and split the `custom` OpenAI-compatible preset handling throughout. Two separate sets were introduced (`LOCAL_OPTGROUP_PRESETS` for the dropdown, `LOCAL_RESIDENCY_PRESETS` for data-residency logic) to fix a regression where the `custom` preset was claiming local data residency even when the user could point it at a remote URL. The privacy notice fix required two layered commits (`12fa410` and `793165d`): the first excluded `'custom'` from the residency set, but the `PrivacyNotice` component was overriding it via a preflight result (the default localhost URL passes `isLikelyLocalUrl()` on the server, returning `preflight.local = true`). The second commit added an `isCustomPreset` short-circuit in `PrivacyNotice` itself, making `'mixed'` unconditional for the custom preset regardless of preflight state. A follow-up (`d32c3de`) split the `GuardrailsSection` `useEffect` into two, adding `[ai.provider, ai.openaiCompatibleBaseUrl, ai.openaiCompatiblePreset]` as dependencies to the preflight effect so the notice re-evaluates correctly after any in-session config change.

Additional fixes: a synchronous Feature Defaults save gate blocks routes to unavailable providers (`claude-account` always, `codex-account` when runtime unavailable); all user-visible `'app-server'` copy replaced with `'Codex CLI component'` / `'Codex account component'`; the `codexAccountEnabledByEnv()` helper exported from `session.ts` and reused in `service.ts` to remove a duplicate inline IIFE. A read-only copy audit identified `docs/SETTINGS.md` AI & Agents section as stale (describes old four-card flat layout), backup step-by-step recipes as missing, and a restore procedure gap — all deferred pending Director assignment. The linked agents product decision resolved to keep as-is for RC (no structural change, no clarifying sentence added).

---

## 2026-05-13 — Configurable Categories Gate + Help Mode Coverage

This session resolved all review findings on the configurable categories UI slice (`576632c`) through a sequence of five follow-up commits, then expanded Help Mode contextual marker coverage to five previously uncovered surfaces.

The categories gate work (`b8c2f16` through `8286e75`) fixed: markdown export writing `undefined` for custom category IDs; Discover Pattern Insight prose using raw IDs instead of labels; the server `builtIn` spoof vulnerability (client-supplied `builtIn: true` for unknown IDs is now silently dropped); an empty-slug bypass where symbols-only names (e.g. `!!!`) could submit an empty-ID category; the Reviewer-flagged safe-delete guard running on every request path including empty-body PATCH calls. The most significant fix (`8286e75`) restructured the `PATCH /api/settings/categories` handler so that any body without an explicit `items` array is a strict no-op — the guard and the `setSetting` call are now both inside the `Array.isArray(rawConfig.items)` branch, preventing any body shape from accidentally wiping custom categories. The gate was confirmed closed by both Tester (PASS) and Reviewer Codex (ACCEPT) on the full chain.

Help Mode coverage (`e96f6d3`) added `HelpButton` markers to Board, Compost, Discover (page header + Pattern Insight card), Settings → General (Data section), and Settings → Theme (theme picker heading). This commit also fixed two pre-existing typecheck errors introduced by the in-progress Claude account provider WIP: missing `claudeAccountAuthenticated: false` in the default config objects in `client/src/stores/settings.ts` and `server/src/ai/service.ts`, and an unused `_config` parameter in the Claude account provider's `listModels()` method.

---

## 2026-05-13 — Release Candidate UX Foundation

This release-candidate wave split the next usability work into smaller reviewable commits after the stabilization pass. It added the first Help Mode discoverability slice, introduced shared AI provider metadata and clearer provider labels, cleaned public release workflow notes, clarified local-only/provider copy, and hardened Ollama runtime diagnostics with a real generation smoke test.

The branch is currently five commits ahead of `origin/main`: `34f1769` for the Help Mode banner/highlight behavior, `0bb9d61` for provider metadata and OpenRouter/custom endpoint naming, `d5b2039` for release workflow cleanup, `3897c62` for provider guardrail copy, and `6328924` for Ollama runtime checks. Typecheck/build passed after the stack, with only the existing Vite chunk-size warning.

---

## 2026-05-13 — Release Candidate Stabilization

This release-candidate wave focused on making Seedbank safer and easier to operate as a local-first app before public packaging.

- Added the AI provider registry, OpenAI-compatible transport support, provider presets, Ollama discovery/health improvements, and per-feature provider/model routing.
- Replaced the one-shot field suggestion flow with a guided AI assistance modal that supports intent selection, playbooks, refinement, review/apply, and isolated field-assist conversation.
- Expanded AI guardrails with scoped budgets, provider/feature toggles, model allowlists, preflight warnings/confirmations, usage detail, audit events, clearer errors, and privacy guidance.
- Improved backup retention, JSON exports, non-destructive test-restore, WAL-safe snapshots, destination abstraction, local/network paths, and rclone remote support.
- Expanded integration metadata, health checks, dynamic configuration UI, discovery/action stubs, and clearer project-scaffold behavior.
- Improved Help Mode discoverability and updated in-app manual copy for AI, backups, integrations, guardrails, and release behavior.
- Added archive release packaging for Linux, macOS, and Windows, including smoke checks, aggregate manifests, release documentation, and a trusted self-hosted macOS packaging path.

Validation completed for the stabilization wave included typecheck, build, targeted API/UI checks, release package smoke checks, and workflow/security review.

---

## 2026-05-12 — Public Product Definition And Packaging Direction

This wave clarified Seedbank as a local-first single-user app with platform-neutral integrations and a practical archive-based packaging path.

- Public documentation was reframed around local storage, local/LAN operation, generic project adapters, and explicit security boundaries.
- Launcher scripts and release packaging guidance were improved for Linux, macOS, and Windows.
- AI provider extensibility work was scoped around direct API providers, local providers, and OpenAI-compatible custom endpoints.
- Release packaging was intentionally kept archive-based for now; native installers, signing, notarization, and auto-update remain future work.

---

## 2026-05-12 — Help, Themes, API, And Settings Polish

This wave completed the broader settings and documentation surface needed for public use.

- Added and refined the Settings page structure across general settings, themes, backups, integrations, AI/agents, and API/server configuration.
- Added the searchable in-app manual and contextual help surfaces.
- Expanded theme support and cleaned up stale theme references.
- Implemented API/server settings for personal access tokens, webhook configuration, and OpenAPI discovery.
- Tightened public documentation around API scopes, local-first behavior, integration framing, and user-visible settings.

---

## 2026-05-12 — Settings Infrastructure, Theming System, And Settings Store

This wave established the application settings foundation.

- Added a seven-tab settings shell and moved scattered configuration into dedicated settings tabs.
- Added the runtime theming system using CSS custom properties and persisted theme preferences.
- Added a shared settings store that hydrates from the server, patches section-level settings, and falls back safely when offline.
- Migrated backup, integration, and theme settings to the shared store.

---

## 2026-05-12 — Retrospective Detail: Docs, Screenshots, Themes, AI Foundations, And Release Packaging

Backfilled from commit history after the public development log was created. This section intentionally avoids author emails, local machine paths, credentials, and environment-specific private values.

The early May 12 work expanded the public documentation and API surface before the release-candidate push. Commits `542a5be` and `4ac12f9` added the standalone API reference and refreshed the architecture, integrations, settings, theming, agents, and AI guide docs. `41bed9e` then completed the API & Server settings tab UI, tying together server info, personal access token management, webhook configuration, and OpenAPI discovery. `41aa370`, `47b9619`, and `946292f` cleaned up stale links, updated the README and changelog for the current product state, and improved API error response polish.

Screenshot and public-showcase tooling followed in `553d898`, `d16a35c`, `f1d6cb4`, `d7c3aea`, and `19e442c`. The screenshot capture workflow became deterministic and path-neutral, generated screenshot outputs were ignored by default, and curated README screenshots were added for the v2.2 presentation. The related safety pass guarded against destructive screenshot seed behavior during documentation refreshes.

Theme and help work landed as a larger v2.2 slice. `8cf35b8` added four new themes, the in-app manual, and the contextual help system. Follow-up commits `ac8b580`, `7c44a4d`, `7d3be8a`, `50b9e59`, `3ce6603`, `342b91d`, and `3b46bf4` improved small-text contrast, tightened mobile/help behavior, expanded the theme count, renamed theme identities for distinctness, removed stale theme names from docs/scripts/comments, added legacy server-side theme migration, and documented the v2.2 release.

The product framing shifted toward platform-neutral local operation through `28b1064`, `36e21a6`, `de6fd6c`, `b490b40`, `9f90c2c`, `642f03a`, `01e448e`, `49e088b`, `b516465`, `3763222`, `9f4ce20`, and `9a4d97f`. The docs were reframed around generic integrations rather than one specific downstream workflow, launcher-first setup, local/LAN security boundaries, neutral provider language, scoped AI extensibility guidance, and accurate agent workspace wording. Sensitive or overly specific scaffold metadata was scrubbed, a workspace-path leak was removed from scaffold context, and overbroad isolation claims were softened.

The late May 12 release-candidate foundation commits (`40eb8d5`, `54ddcf5`, `692a752`, `d018d99`) added the first AI guardrail and integration foundations, improved AI assistance/settings UX, introduced archive-based release packaging, and updated setup/provider guidance. Those commits are the basis for the May 13 stabilization entry above.

## 2026-05-11 — Persistent Backend, Project Graduation, Settings, API, Agents, And Local Launchers

Backfilled from commit history after the public development log was created. This section intentionally avoids author emails, local machine paths, credentials, and environment-specific private values.

Commit `633aabc` was the major architecture turn from browser-only/local-cache behavior into a persistent local application backend. It introduced the server-backed storage direction, project graduation support, and AI-assisted development workflows. This established Seedbank as a local-first app with a durable backend source of truth, while preserving the client-side experience and migration path.

The public documentation pass in `dac81d8` expanded the repo from a working app into a public-showcase project. The docs were broadened to explain setup, architecture, integrations, AI assistance, settings, local-first storage, and safe operating boundaries. `d5ef26a` then added cross-platform launcher scripts and desktop integration so the app could be started more like a local product than a loose development server.

The settings foundation landed through `ba33f73`, `c973847`, `4ebef09`, and `4cd2157`. The UI gained the initial settings page structure; the server gained namespaced settings and an aggregate settings endpoint; legacy settings migration received reviewer cleanup; and the client gained a settings store that hydrates from the API, persists section updates, mirrors relevant UI state, and falls back cleanly when offline.

The server/API layer expanded through `fc92ac6`, `9de2496`, `fa5dac7`, and `2d73bd2`. Seedbank gained personal access token support, token-scoped auth middleware, server info, token-gated read-only MCP endpoints, outbound lifecycle webhooks, and a generated OpenAPI spec at `/api/openapi.json`. `f6de4b0` connected the client-side connection indicator to the API settings surface so server status became actionable from the UI.

The first full theming system landed in `131a2db`: six themes, live theme switching, CSS-variable-backed tokens, and a no-FOUC boot path that applies the stored theme before React renders. This became the base for the larger theme expansion on May 12.

The AI & Agents surface began in `34af635`. That slice added the AI & Agents settings tab, cleaned up the AI chat panel, and introduced agent run surfaces for local development assistance. Follow-up hardening commits `8c5f06a`, `1db7f0c`, `f557989`, and `57d4b4d` tightened agent output application: transcript paths were hidden, path traversal was blocked, symlink edge cases were handled, and client/server contract mismatches from review were resolved.

## 2026-05-08 — Core Application Buildout: Data, Shell, Board, Detail, Import/Export, Discovery, Polish, And Docs

Backfilled from commit history after the public development log was created. This section intentionally avoids author emails, local machine paths, credentials, and environment-specific private values.

The main application buildout happened as a sequence of phase commits. `ad3cc38` created the data layer with shared types, Dexie schema, CRUD helpers, and automatic versioning. This gave ideas a structured local persistence model and made later import/export/version-history behavior possible.

`47093c3` added the app shell, routing, and quick capture flow. This established the main navigation frame and the fast idea-entry path. `e7e8f78` built the Board view with a card grid, filter bar, search, and empty states, making the core idea library browsable. `ce041f9` added the Idea Detail/editor view so individual ideas could be opened, edited, scored, staged, and expanded beyond quick capture.

`d82a4a5` added import and export support, creating the first durable migration/sharing path outside browser storage. `1a7beee` then added the discovery and "delight" features: Daily Seed, Cross-Pollinate, Idea Weather, and Draw from Storage. These shifted the product from a plain tracker toward an idea-recombination tool.

Visual and interaction polish followed in `a6a4d6b` and `bc084d4`. The app received a more complete visual treatment, keyboard shortcuts, an error boundary, favicon work, README updates, and final pre-doc polish. `bd05fb2` added JSDoc coverage across source files, CHANGELOG content, and metadata updates.

The review cleanup in `0fa0cf0` addressed Markdown round-trip behavior, switched to self-hosted fonts, and cleaned up lint findings. `1d306c3` normalized the README filename casing so docs links and repository conventions were consistent.

## 2026-05-07 — Project Definition And Initial Vite/React Scaffold

Backfilled from commit history after the public development log was created. This section intentionally avoids author emails, local machine paths, credentials, and environment-specific private values.

Seedbank started with documentation-first product framing. `3049980` added the initial README, defining the project as an idea manager for capturing, growing, rediscovering, and eventually acting on project ideas. `1fac70f` clarified the README workflow so the intended user path and garden metaphor were easier to follow.

The first implementation commit, `73e1f54`, scaffolded the app with Vite, React, TypeScript, Tailwind, path aliases, and Seedbank theme tokens. This established the frontend stack, base styling vocabulary, and project structure that the May 8 phase commits built on.
