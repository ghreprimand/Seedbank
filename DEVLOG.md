# Seedbank — Development Log

Newest entries at the top.

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
